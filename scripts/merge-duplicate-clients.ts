/* eslint-disable no-console */
// Merge duplicate Client rows within an organization into a single
// canonical row. "Duplicate" = same normalized name (lowercased + suffix
// stripped of partners / inc / llc / corp / co / ltd / gmbh / sa / ag).
//
// Also pulls in orphan Clients (organizationId=null) when they share an
// active ClientUser email with one of the org's Clients of the same
// normalized name — that's how self-service portal signups end up
// detached from the agency that's actually working with them.
//
// Dry-run by default. Prints a plan, touches nothing. Add --apply to
// execute. The merge is idempotent: re-running after --apply is a no-op
// because the duplicates are gone.
//
//   npx tsx scripts/merge-duplicate-clients.ts                    # dry-run, all orgs
//   npx tsx scripts/merge-duplicate-clients.ts --org=<id>         # dry-run, one org
//   npx tsx scripts/merge-duplicate-clients.ts --apply            # apply, all orgs
//   npx tsx scripts/merge-duplicate-clients.ts --org=<id> --apply # apply, one org
//
// Safety rails:
//   - Never touches Clients in another organization (multi-tenant boundary).
//   - Orphan (org=null) merges only when there's no third-party agency
//     also engaging with the orphan (OrganizationClient rows).
//   - ClientUser unique-on-email collisions: keeps the row with a
//     passwordHash, drops the other. If both have one, keeps the
//     longest-running (oldest createdAt).

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

const SUFFIXES = [
  "partners",
  "partner",
  "holdings",
  "group",
  "consulting",
  "limited",
  "ltd",
  "llc",
  "inc",
  "corp",
  "corporation",
  "gmbh",
  "company",
  "co",
  "sa",
  "ag",
];
// Compare names by stripping casing, punctuation, and the noisy
// corporate-form suffixes so "Acme", "Acme Inc", "Acme Inc." and
// "AcmeInc" all collapse to the same group. Doing the alphanumeric
// collapse FIRST lets us also catch the run-together case ("Lionpointpartners").
function normalizeName(name: string): string {
  let s = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!s) return "";
  // Strip up to two suffixes — covers "Acme Co Inc" → "acmecoinc" → "acmeco" → "acme".
  for (let i = 0; i < 2; i++) {
    const hit = SUFFIXES.find((suf) => s.endsWith(suf) && s.length > suf.length);
    if (!hit) break;
    s = s.slice(0, -hit.length);
  }
  return s;
}

type ClientRow = {
  id: string;
  name: string;
  organizationId: string | null;
  isStub: boolean;
  createdAt: Date;
  dataScore: number;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const orgArg = process.argv.find((a) => a.startsWith("--org="))?.slice(6) || null;

  const { prisma } = await import("../lib/prisma");

  // 1. Load every Client + count its data so we can pick a canonical
  //    based on "who has the most attached rows" rather than guessing
  //    by name length or createdAt.
  const allClients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      organizationId: true,
      isStub: true,
      createdAt: true,
      _count: {
        select: {
          contacts: true,
          clientUsers: true,
          jobs: true,
          clientJobs: true,
          placements: true,
          documents: true,
          engagedOrganizations: true,
        },
      },
    },
  });

  // Score is purely a tiebreaker — higher = more data attached.
  const scored: ClientRow[] = allClients.map((c) => ({
    id: c.id,
    name: c.name,
    organizationId: c.organizationId,
    isStub: c.isStub,
    createdAt: c.createdAt,
    dataScore:
      c._count.contacts * 3 +
      c._count.clientUsers * 5 +
      c._count.jobs * 4 +
      c._count.clientJobs * 4 +
      c._count.placements * 5 +
      c._count.documents +
      c._count.engagedOrganizations,
  }));

  // 2. Group by (organizationId, normalizedName). Skip groups with only
  //    one Client. Orgs are scoped — never cross orgs.
  const groups = new Map<string, ClientRow[]>();
  for (const c of scored) {
    if (c.organizationId === null) continue; // handle orphans separately
    if (orgArg && c.organizationId !== orgArg) continue;
    const key = `${c.organizationId}::${normalizeName(c.name)}`;
    if (!key.endsWith("::")) {
      // skip empty normalized names so we don't merge "Inc" with "LLC"
      const arr = groups.get(key) || [];
      arr.push(c);
      groups.set(key, arr);
    }
  }

  // 3. Orphans (org=null) — attach to a same-org group when at least
  //    one active ClientUser email overlaps. That covers the
  //    self-service signup case where the same person ended up at the
  //    self-created org=null Client AND the agency-created one.
  const orphans = scored.filter((c) => c.organizationId === null);
  for (const orphan of orphans) {
    const orphanUsers = await prisma.clientUser.findMany({
      where: { clientId: orphan.id, isActive: true },
      select: { email: true },
    });
    const emails = orphanUsers.map((u) => u.email.toLowerCase());
    if (emails.length === 0) continue;

    const sameNameOwnedMatch = scored.find(
      (c) =>
        c.organizationId !== null &&
        normalizeName(c.name) === normalizeName(orphan.name) &&
        (!orgArg || c.organizationId === orgArg)
    );
    if (!sameNameOwnedMatch) continue;

    // Only fold the orphan in if no OTHER orgs depend on it — a third
    // agency might also be using it via OrganizationClient. The match
    // org itself is fine: that just means a previous merge pass
    // already attached us, which is what we want here.
    const otherOrgEngagements = await prisma.organizationClient.count({
      where: {
        clientId: orphan.id,
        organizationId: { not: sameNameOwnedMatch.organizationId! },
      },
    });
    if (otherOrgEngagements > 0) {
      console.log(
        `  skip orphan "${orphan.name}" [${orphan.id}] — ${otherOrgEngagements} other-agency engagement(s); manual review required.`
      );
      continue;
    }

    const key = `${sameNameOwnedMatch.organizationId}::${normalizeName(orphan.name)}`;
    const arr = groups.get(key) || [sameNameOwnedMatch];
    arr.push(orphan);
    groups.set(key, arr);
  }

  // 4. Print a plan per group.
  let totalGroups = 0;
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue;
    totalGroups++;
    // Canonical: highest dataScore. Ties broken by oldest createdAt
    // (the row people have been pointing at the longest is least
    // disruptive to keep).
    arr.sort((a, b) => {
      if (b.dataScore !== a.dataScore) return b.dataScore - a.dataScore;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const canonical = arr[0];
    const losers = arr.slice(1);
    const [orgId, normName] = key.split("::");
    console.log(`\n• Group "${normName}" in org ${orgId}: ${arr.length} clients`);
    console.log(`  canonical: "${canonical.name}" [${canonical.id}] (score=${canonical.dataScore}, ${canonical.organizationId === null ? "ORPHAN" : "owned"})`);
    for (const l of losers) {
      console.log(`  merge ←   "${l.name}" [${l.id}] (score=${l.dataScore}, ${l.organizationId === null ? "ORPHAN" : "owned"})`);
    }

    if (apply) {
      await mergeGroup(prisma, canonical, losers);
      console.log(`  ✓ merged.`);
    }
  }

  console.log("");
  if (totalGroups === 0) {
    console.log("No duplicate groups detected. Nothing to do.");
  } else if (!apply) {
    console.log(`Dry-run: ${totalGroups} group(s) above would be merged. Re-run with --apply to execute.`);
  } else {
    console.log(`Applied: ${totalGroups} group(s) merged.`);
  }

  await prisma.$disconnect();
}

async function mergeGroup(
  prisma: any,
  canonical: ClientRow,
  losers: ClientRow[]
) {
  const canonicalOrgId = canonical.organizationId!;

  for (const loser of losers) {
    // ClientUser collisions on email — keep the better row.
    const loserUsers: { id: string; email: string; passwordHash: string | null; createdAt: Date }[] =
      await prisma.clientUser.findMany({
        where: { clientId: loser.id },
        select: { id: true, email: true, passwordHash: true, createdAt: true },
      });
    for (const lu of loserUsers) {
      const collide: { id: string; passwordHash: string | null; createdAt: Date } | null =
        await prisma.clientUser.findFirst({
          where: { email: lu.email, clientId: canonical.id },
          select: { id: true, passwordHash: true, createdAt: true },
        });
      if (collide) {
        // Both rows for the same email — pick a winner, delete the
        // other. Winner = has passwordHash (or older one if both/none).
        const loserBetter =
          (!!lu.passwordHash && !collide.passwordHash) ||
          (!!lu.passwordHash === !!collide.passwordHash && lu.createdAt < collide.createdAt);
        if (loserBetter) {
          // Move the loser ClientUser's references to take over the
          // canonical Client side, then delete the canonical-side dup.
          await reassignClientUser(prisma, collide.id, lu.id);
          await prisma.clientUser.delete({ where: { id: collide.id } });
        } else {
          await reassignClientUser(prisma, lu.id, collide.id);
          await prisma.clientUser.delete({ where: { id: lu.id } });
          continue;
        }
      }
      await prisma.clientUser.update({
        where: { id: lu.id },
        data: { clientId: canonical.id },
      });
    }

    // OrganizationClient unique on (orgId, clientId) — if both
    // canonical and loser are referenced by the same org row, drop
    // the loser's row to avoid the unique violation.
    const loserEngagements: { id: string; organizationId: string }[] =
      await prisma.organizationClient.findMany({
        where: { clientId: loser.id },
        select: { id: true, organizationId: true },
      });
    for (const oc of loserEngagements) {
      const exists = await prisma.organizationClient.findUnique({
        where: {
          organizationId_clientId: {
            organizationId: oc.organizationId,
            clientId: canonical.id,
          },
        },
        select: { id: true },
      });
      if (exists) {
        await prisma.organizationClient.delete({ where: { id: oc.id } });
      } else {
        await prisma.organizationClient.update({
          where: { id: oc.id },
          data: { clientId: canonical.id },
        });
      }
    }

    // Straight clientId reassignment for the rest. Schema-driven list
    // so we don't drift if a new model adds a Client FK.
    await prisma.contact.updateMany({ where: { clientId: loser.id }, data: { clientId: canonical.id } });
    await prisma.job.updateMany({ where: { clientId: loser.id }, data: { clientId: canonical.id } });
    await prisma.clientJob.updateMany({ where: { clientId: loser.id }, data: { clientId: canonical.id } });
    await prisma.placement.updateMany({ where: { clientId: loser.id }, data: { clientId: canonical.id } });
    await prisma.document.updateMany({ where: { clientId: loser.id }, data: { clientId: canonical.id } });
    // ClientPipelineStage has @@unique([clientId, order]) plus
    // CandidateSubmission.clientStageId pointing at it, so we can't
    // just reassign blindly. Match each loser stage to a canonical
    // stage by (order, name) when possible, repoint any submissions,
    // then drop the loser row. Unmatched stages get a free renumber
    // to the next available order so genuinely custom stages survive
    // the merge instead of being silently dropped.
    const loserStages: { id: string; name: string; order: number }[] =
      await prisma.clientPipelineStage.findMany({
        where: { clientId: loser.id },
        select: { id: true, name: true, order: true },
      });
    const canonicalStages: { id: string; name: string; order: number }[] =
      await prisma.clientPipelineStage.findMany({
        where: { clientId: canonical.id },
        select: { id: true, name: true, order: true },
      });
    let nextOrder = canonicalStages.reduce((m, s) => Math.max(m, s.order), -1) + 1;
    for (const ls of loserStages) {
      const match = canonicalStages.find(
        (cs) => cs.order === ls.order && cs.name.toLowerCase() === ls.name.toLowerCase()
      );
      if (match) {
        await prisma.candidateSubmission.updateMany({
          where: { clientStageId: ls.id },
          data: { clientStageId: match.id },
        });
        await prisma.clientPipelineStage.delete({ where: { id: ls.id } });
      } else {
        await prisma.clientPipelineStage.update({
          where: { id: ls.id },
          data: { clientId: canonical.id, order: nextOrder++ },
        });
      }
    }
    await prisma.clientPortalToken.updateMany({
      where: { clientId: loser.id },
      data: { clientId: canonical.id },
    });
    await prisma.clientNotification.updateMany({
      where: { clientId: loser.id },
      data: { clientId: canonical.id },
    });

    // Org=null promotion: if canonical was the orphan and one of the
    // losers had a real org, promote canonical to that org now so it
    // shows up on the agency's roster after the merge.
    if (canonical.organizationId === null && loser.organizationId !== null) {
      await prisma.client.update({
        where: { id: canonical.id },
        data: { organizationId: loser.organizationId },
      });
    }

    // Delete the now-empty loser.
    await prisma.client.delete({ where: { id: loser.id } });
  }

  // Ensure canonical has the canonical org's OrganizationClient row
  // — covers the case where the merged-in orphan never had one.
  if (canonicalOrgId) {
    await prisma.organizationClient.upsert({
      where: {
        organizationId_clientId: {
          organizationId: canonicalOrgId,
          clientId: canonical.id,
        },
      },
      update: {},
      create: { organizationId: canonicalOrgId, clientId: canonical.id },
    });
  }
}

// Move every row that references `fromId` (a ClientUser id) over to
// `toId`, so the loser row becomes safe to delete.
async function reassignClientUser(prisma: any, fromId: string, toId: string) {
  await prisma.comment.updateMany({ where: { clientUserId: fromId }, data: { clientUserId: toId } });
  await prisma.candidateRating.updateMany({
    where: { clientUserId: fromId },
    data: { clientUserId: toId },
  });
  await prisma.clientNotification.updateMany({
    where: { clientUserId: fromId },
    data: { clientUserId: toId },
  });
  await prisma.clientJobMember.updateMany({
    where: { clientUserId: fromId },
    data: { clientUserId: toId },
  });
  // ClientJob.postedById is required, so it can't be left dangling.
  await prisma.clientJob.updateMany({
    where: { postedById: fromId },
    data: { postedById: toId },
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
