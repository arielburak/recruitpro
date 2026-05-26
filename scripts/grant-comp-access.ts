/* eslint-disable no-console */
// Flips Subscription.isComp = true on every org whose users look like
// Nicolas / Ariel test accounts. Matching is by email + display name
// against a small substring list — case-insensitive contains.
// Orgs without a Subscription row yet get one created (status=ACTIVE,
// isComp=true) so the subscription guard passes immediately.
//
// SAFE BY DEFAULT: prints what it would do and bails out unless
// --execute is passed. Idempotent — re-running just no-ops on rows
// that are already comp'd.
//
// Usage:
//   Dry run :  npx tsx scripts/grant-comp-access.ts
//   Execute :  npx tsx scripts/grant-comp-access.ts --execute

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const execute = process.argv.includes("--execute");
  const { prisma } = await import("../lib/prisma");

  // Substrings we treat as "Nicolas or Ariel test account." Tight
  // enough to not catch unrelated users named e.g. "Aristides". If
  // you need to broaden this for a different test cohort, add the
  // substring here.
  const needles = ["nico", "nicolas", "cuello", "ari", "ariel", "arielb"];

  const users = await prisma.user.findMany({
    where: {
      OR: needles.flatMap((n) => [
        { email: { contains: n, mode: "insensitive" as const } },
        { name: { contains: n, mode: "insensitive" as const } },
      ]),
    },
    select: {
      id: true, email: true, name: true,
      organizationId: true,
      organization: { select: { id: true, name: true } },
    },
    orderBy: { email: "asc" },
  });

  if (users.length === 0) {
    console.log("No matching users found. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  // Group by org so we touch each Subscription row only once.
  const orgs = new Map<string, { name: string; users: typeof users }>();
  for (const u of users) {
    const existing = orgs.get(u.organizationId) || {
      name: u.organization?.name || "?",
      users: [],
    };
    existing.users.push(u);
    orgs.set(u.organizationId, existing);
  }

  console.log(`Matched ${users.length} users across ${orgs.size} orgs.\n`);
  for (const [orgId, info] of orgs) {
    const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    const matchedEmails = info.users.map((u) => u.email).join(", ");
    const willAct = !sub || !sub.isComp;
    const marker = willAct ? "→" : "·";
    console.log(`${marker} ${info.name} (${orgId})`);
    console.log(`    Users: ${matchedEmails}`);
    if (!sub) {
      console.log(`    Action: CREATE Subscription with isComp=true status=ACTIVE`);
    } else if (sub.isComp) {
      console.log(`    Action: skip — already isComp=true`);
    } else {
      console.log(`    Action: UPDATE Subscription.isComp from false to true (was ${sub.status})`);
    }
  }

  if (!execute) {
    console.log(`\n[dry run] Re-run with --execute to apply changes.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n[execute] Applying…`);
  let updated = 0, created = 0, skipped = 0;
  for (const [orgId] of orgs) {
    const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    if (!sub) {
      // Subscription.stripeCustomerId is @unique — we need SOMETHING
      // unique even for comp orgs. Use a stable synthetic value
      // prefixed with `comp_` so it's obvious in the DB and never
      // collides with a real Stripe cus_… id.
      await prisma.subscription.create({
        data: {
          organizationId: orgId,
          stripeCustomerId: `comp_${orgId}`,
          status: "ACTIVE",
          isComp: true,
        },
      });
      created++;
      continue;
    }
    if (sub.isComp) {
      skipped++;
      continue;
    }
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { isComp: true },
    });
    updated++;
  }
  console.log(`Created: ${created}  Updated: ${updated}  Skipped (already comp): ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
