/* eslint-disable no-console */
// Nukes an entire organization (and all its data) so a test email
// can be re-registered from scratch. Intended for QA — DO NOT point
// this at a real customer org.
//
// Usage:
//   npx tsx scripts/delete-test-account.ts user@example.com
//
// What it deletes, in order (org-scoped FKs don't cascade, so we
// walk the graph manually):
//   1. All Comments, Activities, Notifications for the user
//   2. All Interviews + assignments + feedback under org's jobs
//   3. All CandidateSubmissions, Placements, Notes
//   4. All Candidates, Jobs, Contacts, Clients, JobAssignments
//   5. The user(s) of the org
//   6. The org itself + its Subscription
//
// Wrapped in a transaction so partial failures don't leave half-
// deleted state.

import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/delete-test-account.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, organizationId: true },
  });
  if (!user) {
    console.log(`No user with email ${email} — nothing to delete.`);
    return;
  }

  console.log(`Found user ${user.name} (${email}) in org ${user.organizationId}.`);
  console.log("Deleting org + all related data…");

  const orgId = user.organizationId;

  await prisma.$transaction(async (tx) => {
    // Get all jobs, candidates, clients, contacts in the org so we
    // can clean their dependent rows first.
    const jobs = await tx.job.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const candidates = await tx.candidate.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const clients = await tx.client.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const jobIds = jobs.map((j) => j.id);
    const candidateIds = candidates.map((c) => c.id);
    const clientIds = clients.map((c) => c.id);

    // Interviews (most have cascade on their join tables, but we
    // delete them up front to be sure).
    await tx.interview.deleteMany({
      where: {
        OR: [
          { jobId: { in: jobIds } },
          { candidateId: { in: candidateIds } },
        ],
      },
    });

    // Submissions, placements, notes, comments, activities.
    await tx.candidateSubmission.deleteMany({
      where: { jobId: { in: jobIds } },
    });
    await tx.placement.deleteMany({
      where: { organizationId: orgId },
    });
    await tx.comment.deleteMany({
      where: {
        OR: [
          { candidateId: { in: candidateIds } },
          { jobId: { in: jobIds } },
        ],
      },
    });
    await tx.activity.deleteMany({
      where: { organizationId: orgId },
    });
    await tx.userNotification.deleteMany({
      where: { user: { organizationId: orgId } },
    });

    // Job assignments + firm engagements + client team.
    await tx.jobAssignment.deleteMany({
      where: { jobId: { in: jobIds } },
    });
    await tx.firmEngagement.deleteMany({
      where: { organizationId: orgId },
    });
    await tx.clientUser.deleteMany({
      where: { clientId: { in: clientIds } },
    });

    // Top-level org entities.
    await tx.candidate.deleteMany({ where: { organizationId: orgId } });
    await tx.job.deleteMany({ where: { organizationId: orgId } });
    await tx.contact.deleteMany({ where: { organizationId: orgId } });
    await tx.client.deleteMany({ where: { organizationId: orgId } });

    // User-scoped: integrations + the user(s) themselves.
    await tx.userIntegration.deleteMany({
      where: { user: { organizationId: orgId } },
    });
    await tx.user.deleteMany({ where: { organizationId: orgId } });

    // Subscription + org.
    await tx.subscription.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
  });

  console.log(`Done. ${email} can register from scratch now.`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
