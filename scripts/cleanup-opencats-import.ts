/* eslint-disable no-console */
// Dry-run / executor for cleaning up a bulk test import.
//
// Counts (and optionally deletes) entities created in <org> within the
// given time window. Covers candidates, jobs, client engagements, and
// orphan Client rows (Clients no other org engages with and that
// haven't accrued contacts/jobs from elsewhere).
//
// SAFE BY DEFAULT: prints counts and bails out unless --execute is passed.
//
// Usage:
//   npx tsx scripts/cleanup-opencats-import.ts --org <orgId|email> [--hours N] [--execute]
//
// Examples:
//   Dry run by user email, last 7 days:
//     npx tsx scripts/cleanup-opencats-import.ts --org ncuello@morabits.net --hours 168
//   Actually delete:
//     npx tsx scripts/cleanup-opencats-import.ts --org ncuello@morabits.net --hours 168 --execute

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf("--org");
  const orgArg = orgIdx >= 0 ? args[orgIdx + 1] : null;
  if (!orgArg) {
    console.error("Usage: npx tsx scripts/cleanup-opencats-import.ts --org <orgId|email> [--hours N] [--execute]");
    process.exit(1);
  }
  const execute = args.includes("--execute");
  const hoursIdx = args.indexOf("--hours");
  const hours = hoursIdx >= 0 ? parseInt(args[hoursIdx + 1], 10) : 168;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const { prisma } = await import("../lib/prisma");

  let org;
  if (orgArg.includes("@")) {
    const user = await prisma.user.findUnique({
      where: { email: orgArg },
      include: { organization: true },
    });
    if (!user) {
      console.error(`No user found for ${orgArg}`);
      process.exit(1);
    }
    org = user.organization;
  } else {
    org = await prisma.organization.findUnique({ where: { id: orgArg } });
    if (!org) {
      console.error(`No org found for id ${orgArg}`);
      process.exit(1);
    }
  }
  console.log(`\nOrg : ${org.name} (${org.id})`);
  console.log(`Cutoff: anything created after ${cutoff.toISOString()} (${hours}h ago)\n`);

  // Time-window match: anything in this org created since the cutoff.
  // Precise for the bulk-import case because the wizard creates rows
  // in tight bursts.
  const candidateWhere = {
    organizationId: org.id,
    createdAt: { gte: cutoff },
  };
  const candidateCount = await prisma.candidate.count({ where: candidateWhere });
  console.log(`Candidates created in this org since cutoff: ${candidateCount}`);

  // ── jobs ──
  // No tag exists — fall back to time window. Jobs in this org created
  // after `cutoff` are very likely from the test import (the user said
  // the import was today).
  const jobWhere = {
    organizationId: org.id,
    createdAt: { gte: cutoff },
  };
  const jobCount = await prisma.job.count({ where: jobWhere });
  console.log(`Jobs created in this org within last ${hours}h: ${jobCount}`);

  // ── clients ──
  // Clients are shared across orgs (PR #139), but the OrganizationClient
  // engagement row is per-org. We delete:
  //   1. The engagement row (so it disappears from the user's /clients list)
  //   2. The Client row IF this org was the only one engaged with it
  //      AND it has no contacts/jobs from other orgs (avoid clobbering
  //      another agency's data).
  const engagements = await prisma.organizationClient.findMany({
    where: {
      organizationId: org.id,
      addedAt: { gte: cutoff },
    },
    include: {
      client: {
        include: {
          engagedOrganizations: true,
          _count: { select: { jobs: true, contacts: true } },
        },
      },
    },
  });
  const orphanClientIds: string[] = [];
  for (const e of engagements) {
    const otherEngagements = e.client.engagedOrganizations.filter((eo) => eo.organizationId !== org.id);
    if (otherEngagements.length === 0 && e.client._count.jobs === 0 && e.client._count.contacts === 0) {
      orphanClientIds.push(e.client.id);
    }
  }
  console.log(`Client engagements (disengage from your org): ${engagements.length}`);
  console.log(`  └─ Orphan Clients (no other org / no contacts / no jobs): ${orphanClientIds.length}`);

  // ── related rows that would cascade ──
  const submissionCount = await prisma.candidateSubmission.count({
    where: { candidate: candidateWhere },
  });
  const interviewCount = await prisma.interview.count({
    where: { submission: { candidate: candidateWhere } },
  });
  const placementCount = await prisma.placement.count({
    where: { submission: { candidate: candidateWhere } },
  });
  console.log(`\nRelated rows that will cascade:`);
  console.log(`  CandidateSubmissions: ${submissionCount}`);
  console.log(`  Interviews          : ${interviewCount}`);
  console.log(`  Placements          : ${placementCount}`);

  if (!execute) {
    console.log(`\n[dry run] Re-run with --execute to actually delete.`);
    return;
  }

  console.log(`\n[execute] Deleting…`);
  // Delete in dependency order. CandidateSubmissions and downstream rows
  // are scoped by candidate org, so they go first.
  const delPlacements = await prisma.placement.deleteMany({
    where: { submission: { candidate: candidateWhere } },
  });
  const delInterviews = await prisma.interview.deleteMany({
    where: { submission: { candidate: candidateWhere } },
  });
  const delSubmissions = await prisma.candidateSubmission.deleteMany({
    where: { candidate: candidateWhere },
  });
  const delCandidates = await prisma.candidate.deleteMany({ where: candidateWhere });

  // Jobs — pipeline stages cascade via schema. CandidateSubmissions on
  // these jobs (if any) were already covered above; this catches jobs
  // that had no submissions yet.
  const delJobs = await prisma.job.deleteMany({ where: jobWhere });

  // Engagements first (so the join row goes away cleanly), then orphan
  // Client rows.
  const delEng = await prisma.organizationClient.deleteMany({
    where: {
      organizationId: org.id,
      addedAt: { gte: cutoff },
    },
  });
  const delClients = orphanClientIds.length
    ? await prisma.client.deleteMany({ where: { id: { in: orphanClientIds } } })
    : { count: 0 };

  console.log(`  Placements deleted          : ${delPlacements.count}`);
  console.log(`  Interviews deleted          : ${delInterviews.count}`);
  console.log(`  Submissions deleted         : ${delSubmissions.count}`);
  console.log(`  Candidates deleted          : ${delCandidates.count}`);
  console.log(`  Jobs deleted                : ${delJobs.count}`);
  console.log(`  Engagements deleted         : ${delEng.count}`);
  console.log(`  Orphan Clients deleted      : ${delClients.count}`);
  console.log(`\nDone.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
