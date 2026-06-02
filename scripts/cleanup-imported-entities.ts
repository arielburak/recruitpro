/* eslint-disable no-console */
// Unwind a bulk import using the externalId marker the import set on
// every row it created. Strictly more precise than the time-window
// cleanup (cleanup-opencats-import.ts): manual rows the user created
// during the test window survive because they were never stamped
// with an externalId.
//
// Order of operations follows the FK dependency chain:
//   placements → interviews → submissions → candidates / jobs →
//   engagements → orphan clients.
//
// SAFE BY DEFAULT: prints counts and bails out unless --execute is passed.
//
// Usage:
//   npx tsx scripts/cleanup-imported-entities.ts --org <orgId|email> [--execute]

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf("--org");
  const orgArg = orgIdx >= 0 ? args[orgIdx + 1] : null;
  if (!orgArg) {
    console.error("Usage: npx tsx scripts/cleanup-imported-entities.ts --org <orgId|email> [--execute]");
    process.exit(1);
  }
  const execute = args.includes("--execute");
  const { prisma } = await import("../lib/prisma");

  let org;
  if (orgArg.includes("@")) {
    const user = await prisma.user.findUnique({ where: { email: orgArg }, include: { organization: true } });
    if (!user) { console.error(`No user found for ${orgArg}`); process.exit(1); }
    org = user.organization;
  } else {
    org = await prisma.organization.findUnique({ where: { id: orgArg } });
    if (!org) { console.error(`No org found for id ${orgArg}`); process.exit(1); }
  }
  console.log(`\nOrg: ${org.name} (${org.id})\n`);

  // A "submission touched by import" = either candidate OR job has
  // an externalId. We delete those, plus the placements/interviews
  // hanging off them. Manual submissions on imported jobs (or vice
  // versa) get cleared too — they can't survive without their other
  // half anyway.
  const importedSubFilter = {
    OR: [
      { candidate: { organizationId: org.id, externalId: { not: null } } },
      { job: { organizationId: org.id, externalId: { not: null } } },
    ],
  };

  const candIm = await prisma.candidate.count({ where: { organizationId: org.id, externalId: { not: null } } });
  const jobIm = await prisma.job.count({ where: { organizationId: org.id, externalId: { not: null } } });
  const engIm = await prisma.organizationClient.count({ where: { organizationId: org.id, externalId: { not: null } } });
  const placementIm = await prisma.placement.count({ where: { submission: importedSubFilter } });
  const interviewIm = await prisma.interview.count({ where: { submission: importedSubFilter } });
  const subIm = await prisma.candidateSubmission.count({ where: importedSubFilter });

  console.log(`Imported (externalId set):`);
  console.log(`  Candidates  : ${candIm}`);
  console.log(`  Jobs        : ${jobIm}`);
  console.log(`  Engagements : ${engIm}`);
  console.log(`  Submissions : ${subIm}`);
  console.log(`  Placements  : ${placementIm}`);
  console.log(`  Interviews  : ${interviewIm}`);

  // Find which engaged-Clients become orphans after we tear down the
  // engagements. A Client is an orphan when no other organization is
  // engaged with it and it carries no contacts/jobs from elsewhere.
  const orphanEngagements = await prisma.organizationClient.findMany({
    where: { organizationId: org.id, externalId: { not: null } },
    include: {
      client: {
        include: {
          engagedOrganizations: true,
          _count: { select: { jobs: true, contacts: true } },
        },
      },
    },
  });
  const orphanClientIds = orphanEngagements
    .filter((e) => {
      const others = e.client.engagedOrganizations.filter((eo) => eo.organizationId !== org.id);
      return others.length === 0 && e.client._count.jobs === 0 && e.client._count.contacts === 0;
    })
    .map((e) => e.client.id);
  console.log(`  └─ Orphan Clients (will be fully removed): ${orphanClientIds.length}`);

  if (!execute) {
    console.log(`\n[dry run] Re-run with --execute to actually delete.`);
    return;
  }

  console.log(`\n[execute] Deleting…`);
  const delPlacements = await prisma.placement.deleteMany({ where: { submission: importedSubFilter } });
  const delInterviews = await prisma.interview.deleteMany({ where: { submission: importedSubFilter } });
  const delSubs = await prisma.candidateSubmission.deleteMany({ where: importedSubFilter });
  const delCands = await prisma.candidate.deleteMany({ where: { organizationId: org.id, externalId: { not: null } } });
  const delJobs = await prisma.job.deleteMany({ where: { organizationId: org.id, externalId: { not: null } } });
  const delEng = await prisma.organizationClient.deleteMany({ where: { organizationId: org.id, externalId: { not: null } } });
  const delOrphans = orphanClientIds.length
    ? await prisma.client.deleteMany({ where: { id: { in: orphanClientIds } } })
    : { count: 0 };

  console.log(`  Placements deleted     : ${delPlacements.count}`);
  console.log(`  Interviews deleted     : ${delInterviews.count}`);
  console.log(`  Submissions deleted    : ${delSubs.count}`);
  console.log(`  Candidates deleted     : ${delCands.count}`);
  console.log(`  Jobs deleted           : ${delJobs.count}`);
  console.log(`  Engagements deleted    : ${delEng.count}`);
  console.log(`  Orphan Clients deleted : ${delOrphans.count}`);

  // Final sanity check
  const candLeft = await prisma.candidate.count({ where: { organizationId: org.id } });
  const jobLeft = await prisma.job.count({ where: { organizationId: org.id } });
  const placementsLeft = await prisma.placement.count({ where: { organizationId: org.id } });
  console.log(`\nAfter cleanup → candidates=${candLeft} jobs=${jobLeft} placements=${placementsLeft}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
