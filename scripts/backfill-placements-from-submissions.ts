/* eslint-disable no-console */
// Backfill Placement rows for every CandidateSubmission already at
// the "Placed" stage that doesn't have one. Used after a bulk import
// that landed submissions but predated the placement-backfill logic
// in /api/import/bulk (PR #163). Idempotent — submissions that
// already have a Placement are skipped.
//
// Date anchor: the submission's createdAt (which the import overrode
// to the historical date_submitted from the source ATS). That way a
// hire from 2024 lands in the 2024 bucket of every report rather
// than appearing as a 2026 placement.
//
// Usage:
//   Dry run :  npx tsx scripts/backfill-placements-from-submissions.ts --org <orgId|email>
//   Execute :  npx tsx scripts/backfill-placements-from-submissions.ts --org <orgId|email> --execute

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf("--org");
  const orgArg = orgIdx >= 0 ? args[orgIdx + 1] : null;
  if (!orgArg) {
    console.error("Usage: npx tsx scripts/backfill-placements-from-submissions.ts --org <orgId|email> [--execute]");
    process.exit(1);
  }
  const execute = args.includes("--execute");

  const { prisma } = await import("../lib/prisma");

  let org;
  if (orgArg.includes("@")) {
    const user = await prisma.user.findUnique({
      where: { email: orgArg },
      include: { organization: true },
    });
    if (!user) { console.error(`No user found for ${orgArg}`); process.exit(1); }
    org = user.organization;
  } else {
    org = await prisma.organization.findUnique({ where: { id: orgArg } });
    if (!org) { console.error(`No org found for id ${orgArg}`); process.exit(1); }
  }
  console.log(`\nOrg: ${org.name} (${org.id})\n`);

  // Find every submission at a Placed stage in this org that doesn't
  // already have a Placement row attached. The job relation gives us
  // the clientId required for the Placement insert.
  const all = await prisma.candidateSubmission.findMany({
    where: {
      job: { organizationId: org.id },
      stage: { name: "Placed" },
      placement: null,
    },
    select: {
      id: true,
      candidateId: true,
      jobId: true,
      createdAt: true,
      job: { select: { clientId: true } },
    },
  });
  // OpenCATS uses "1000-01-01" as the NOT NULL default when a date
  // field was never set. Anchoring a Placement on that sentinel would
  // make /placements display a year-1000 row, which is useless. Drop
  // those (the user can re-stage them manually if they care).
  const targets = all.filter((t) => t.createdAt.getFullYear() >= 2000);
  const dropped = all.length - targets.length;
  console.log(`Submissions at "Placed" without a Placement: ${all.length}`);
  if (dropped > 0) console.log(`  └─ Skipping ${dropped} with sentinel pre-2000 dates`);

  // Year distribution preview so the user can sanity-check before
  // executing.
  const byYear: Record<string, number> = {};
  for (const t of targets) {
    const y = t.createdAt.getFullYear().toString();
    byYear[y] = (byYear[y] || 0) + 1;
  }
  console.log("\nProjected placements by year:");
  for (const [y, c] of Object.entries(byYear).sort()) {
    console.log(`  ${y}: ${c}`);
  }

  if (!execute) {
    console.log(`\n[dry run] Re-run with --execute to actually create them.`);
    return;
  }

  console.log(`\n[execute] Creating ${targets.length} placements…`);
  let created = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      await prisma.placement.create({
        data: {
          submissionId: t.id,
          jobId: t.jobId,
          clientId: t.job.clientId,
          organizationId: org.id,
          // All three dates anchor on the submission's createdAt so the
          // placement lands in the historical bucket. startDate carries
          // the most weight for reports.
          estimatedStartDate: t.createdAt,
          startDate: t.createdAt,
          createdAt: t.createdAt,
          notes: "Imported from source ATS — commercial fields pending.",
        },
      });
      created++;
    } catch (e: any) {
      failed++;
      if (failed <= 5) console.error(`  Failed sub=${t.id}: ${e.message}`);
    }
  }
  console.log(`\nCreated: ${created}  /  Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
