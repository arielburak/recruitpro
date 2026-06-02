/* eslint-disable no-console */
// Nukes an entire organization (and all its data) so a test email
// can be re-registered from scratch. Intended for QA — DO NOT point
// this at a real customer org.
//
// Usage:
//   npx tsx scripts/delete-test-account.ts user@example.com

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

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
    await prisma.$disconnect();
    return;
  }

  console.log(`Found user ${user.name} (${email}) in org ${user.organizationId}.`);
  console.log("Deleting org + all related data…");

  const orgId = user.organizationId;

  // Pull every id we'll need to fan out through. Done up front so the
  // delete loop below can work off plain arrays — keeps the SQL simple.
  const jobs = await prisma.job.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const candidates = await prisma.candidate.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const submissions = await prisma.candidateSubmission.findMany({
    where: { jobId: { in: jobs.map((j) => j.id) } },
    select: { id: true },
  });
  const interviews = await prisma.interview.findMany({
    where: {
      OR: [
        { jobId: { in: jobs.map((j) => j.id) } },
        { candidateId: { in: candidates.map((c) => c.id) } },
      ],
    },
    select: { id: true },
  });
  const clientUsers = await prisma.clientUser.findMany({
    where: { clientId: { in: clients.map((c) => c.id) } },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });

  const jobIds = jobs.map((j) => j.id);
  const candidateIds = candidates.map((c) => c.id);
  const clientIds = clients.map((c) => c.id);
  const submissionIds = submissions.map((s) => s.id);
  const interviewIds = interviews.map((i) => i.id);
  const clientUserIds = clientUsers.map((u) => u.id);
  const userIds = users.map((u) => u.id);

  // Order matters: child rows first, then parents. Many models have
  // onDelete: Cascade on at least one of their FKs, but enough don't
  // that we walk every level manually.
  await prisma.$transaction(async (tx) => {
    // Interview-side leaves.
    await tx.interviewAssignment.deleteMany({
      where: { interviewId: { in: interviewIds } },
    });
    await tx.interviewClientContact.deleteMany({
      where: { interviewId: { in: interviewIds } },
    });
    await tx.interviewFeedback.deleteMany({
      where: { interviewId: { in: interviewIds } },
    });
    await tx.interview.deleteMany({ where: { id: { in: interviewIds } } });

    // Submission-side leaves.
    await tx.comment.deleteMany({
      where: {
        OR: [
          { submissionId: { in: submissionIds } },
          { candidateId: { in: candidateIds } },
          { userId: { in: userIds } },
          { clientUserId: { in: clientUserIds } },
        ],
      },
    });
    await tx.candidateRating.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await tx.candidateSubmission.deleteMany({
      where: { id: { in: submissionIds } },
    });

    // Documents (linked to candidates, jobs, clients).
    await tx.document.deleteMany({
      where: {
        OR: [
          { candidateId: { in: candidateIds } },
          { jobId: { in: jobIds } },
          { clientId: { in: clientIds } },
        ],
      },
    });

    // Placements + activities scoped to the org.
    await tx.placement.deleteMany({ where: { organizationId: orgId } });
    await tx.activity.deleteMany({ where: { organizationId: orgId } });

    // Pipeline stages + client pipeline stages.
    await tx.clientPipelineStage.deleteMany({
      where: { clientId: { in: clientIds } },
    });
    await tx.pipelineStage.deleteMany({ where: { jobId: { in: jobIds } } });

    // ClientJob (jobs posted from the client portal — own model).
    // Cascade fans out to documents + pending invites via the schema.
    await tx.clientJob.deleteMany({
      where: { clientId: { in: clientIds } },
    });

    // Job assignments.
    await tx.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } });

    // Client portal side: notifications + tokens before client users.
    await tx.clientNotification.deleteMany({
      where: { clientId: { in: clientIds } },
    });
    await tx.clientPortalToken.deleteMany({
      where: { clientId: { in: clientIds } },
    });
    await tx.clientUser.deleteMany({ where: { id: { in: clientUserIds } } });

    // Firm engagement side. PendingFirmInvite has no orgId of its
    // own — it cascades from ClientJob, deleted above.
    await tx.firmEngagement.deleteMany({ where: { organizationId: orgId } });

    // User-scoped side: invites, notifications, integrations,
    // password reset tokens.
    await tx.userInvite.deleteMany({ where: { organizationId: orgId } });
    await tx.userNotification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await tx.userIntegration.deleteMany({
      where: { userId: { in: userIds } },
    });
    await tx.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } },
    });

    // Top-level org entities.
    await tx.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    await tx.job.deleteMany({ where: { id: { in: jobIds } } });
    await tx.contact.deleteMany({ where: { organizationId: orgId } });
    await tx.client.deleteMany({ where: { id: { in: clientIds } } });

    // Users + subscription + org.
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.subscription.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
  });

  console.log(`Done. ${email} can register from scratch now.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
