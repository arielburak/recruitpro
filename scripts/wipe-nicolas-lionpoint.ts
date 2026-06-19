import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// First non-flag CLI arg overrides the default email, so this script
// is reusable: `tsx scripts/wipe-nicolas-lionpoint.ts foo@bar.com`.
const argEmail = process.argv.slice(2).find((a) => !a.startsWith("--"));
const EMAIL = argEmail ?? "nicolas@lionpointpartners.com";
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n=== Discovery for ${EMAIL} (DRY_RUN=${DRY_RUN}) ===\n`);

  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      candidates: { select: { id: true } },
      submissions: { select: { id: true } },
      submissionDocsAdded: { select: { id: true } },
      comments: { select: { id: true } },
      activities: { select: { id: true } },
      jobAssignments: { select: { jobId: true } },
      createdInterviews: { select: { id: true } },
      interviewAssignments: { select: { id: true } },
      interviewFeedback: { select: { id: true } },
      integrations: { select: { id: true } },
      notifications: { select: { id: true } },
      firmEngagements: { select: { id: true } },
      createdCalendarEvents: { select: { id: true } },
      attributedPlacements: { select: { id: true } },
    },
  });

  if (user) {
    console.log(`Staffing User found:`);
    console.log(`  id=${user.id}  name=${user.name}  role=${user.role}  active=${user.isActive}`);
    console.log(`  org="${user.organization.name}" (${user.organization.id} / ${user.organization.slug})`);
    console.log(`  accountId=${user.accountId}`);
    console.log(`  References:`);
    console.log(`    candidates=${user.candidates.length}`);
    console.log(`    submissions=${user.submissions.length}`);
    console.log(`    submissionDocsAdded=${user.submissionDocsAdded.length}`);
    console.log(`    comments=${user.comments.length}`);
    console.log(`    activities=${user.activities.length}`);
    console.log(`    jobAssignments=${user.jobAssignments.length}`);
    console.log(`    createdInterviews=${user.createdInterviews.length}`);
    console.log(`    interviewAssignments=${user.interviewAssignments.length}`);
    console.log(`    interviewFeedback=${user.interviewFeedback.length}`);
    console.log(`    integrations=${user.integrations.length}`);
    console.log(`    notifications=${user.notifications.length}`);
    console.log(`    firmEngagements=${user.firmEngagements.length}`);
    console.log(`    createdCalendarEvents=${user.createdCalendarEvents.length}`);
    console.log(`    attributedPlacements=${user.attributedPlacements.length}`);
  } else {
    console.log(`No staffing User row for ${EMAIL}`);
  }

  const clientUsers = await prisma.clientUser.findMany({
    where: { email: EMAIL },
    include: {
      client: { select: { id: true, name: true } },
      comments: { select: { id: true } },
      ratings: { select: { id: true } },
      clientJobs: { select: { id: true, title: true } },
      notifications: { select: { id: true } },
      jobMemberships: { select: { id: true } },
    },
  });

  if (clientUsers.length) {
    console.log(`\nClient-portal ClientUser rows: ${clientUsers.length}`);
    for (const cu of clientUsers) {
      console.log(`  id=${cu.id}  name=${cu.name}  role=${cu.role}  active=${cu.isActive}`);
      console.log(`    client="${cu.client.name}" (${cu.clientId})`);
      console.log(`    accountId=${cu.accountId}`);
      console.log(`    comments=${cu.comments.length}  ratings=${cu.ratings.length}  clientJobs(posted)=${cu.clientJobs.length}  notifications=${cu.notifications.length}  jobMemberships=${cu.jobMemberships.length}`);
    }
  } else {
    console.log(`\nNo ClientUser row for ${EMAIL}`);
  }

  const account = await prisma.account.findUnique({
    where: { email: EMAIL },
    include: { users: { select: { id: true, email: true } }, clientUsers: { select: { id: true, email: true } } },
  });
  if (account) {
    console.log(`\nAccount: id=${account.id}  verifiedAt=${account.emailVerifiedAt?.toISOString() ?? "—"}`);
    console.log(`  linked users:        ${account.users.length}`);
    console.log(`  linked clientUsers:  ${account.clientUsers.length}`);
  } else {
    console.log(`\nNo Account row for ${EMAIL}`);
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] no changes performed`);
    return;
  }

  console.log(`\n=== Deleting... ===\n`);

  // 1) ClientUser side (and its dependent rows)
  for (const cu of clientUsers) {
    await prisma.clientNotification.deleteMany({ where: { clientUserId: cu.id } });
    await prisma.clientJobMember.deleteMany({ where: { clientUserId: cu.id } });
    await prisma.candidateRating.deleteMany({ where: { clientUserId: cu.id } });
    await prisma.comment.deleteMany({ where: { clientUserId: cu.id } });
    // ClientJob.postedById is a FK; just null it out so we keep the jobs.
    if (cu.clientJobs.length) {
      await prisma.clientJob.updateMany({
        where: { postedById: cu.id },
        data: { postedById: null },
      });
      console.log(`  - nulled postedById on ${cu.clientJobs.length} ClientJob(s)`);
    }
    await prisma.clientUser.delete({ where: { id: cu.id } });
    console.log(`  - deleted ClientUser ${cu.id} (client "${cu.client.name}")`);
  }

  // 2) Staffing User side
  if (user) {
    const blockers: string[] = [];
    if (user.candidates.length) blockers.push(`candidates=${user.candidates.length}`);
    if (user.submissions.length) blockers.push(`submissions=${user.submissions.length}`);
    if (user.submissionDocsAdded.length) blockers.push(`submissionDocsAdded=${user.submissionDocsAdded.length}`);
    if (user.comments.length) blockers.push(`comments=${user.comments.length}`);
    if (user.activities.length) blockers.push(`activities=${user.activities.length}`);
    if (user.jobAssignments.length) blockers.push(`jobAssignments=${user.jobAssignments.length}`);
    if (user.createdInterviews.length) blockers.push(`createdInterviews=${user.createdInterviews.length}`);
    if (user.interviewAssignments.length) blockers.push(`interviewAssignments=${user.interviewAssignments.length}`);
    if (user.interviewFeedback.length) blockers.push(`interviewFeedback=${user.interviewFeedback.length}`);
    if (user.firmEngagements.length) blockers.push(`firmEngagements=${user.firmEngagements.length}`);
    if (user.createdCalendarEvents.length) blockers.push(`createdCalendarEvents=${user.createdCalendarEvents.length}`);
    if (user.attributedPlacements.length) blockers.push(`attributedPlacements=${user.attributedPlacements.length}`);

    if (blockers.length) {
      console.log(`\n⚠️  Staffing User has dependent rows: ${blockers.join(", ")}`);
      console.log(`    Skipping hard-delete. Will set isActive=false + scramble email so the address is free to reuse.`);
      const released = `released+${user.id}@deleted.local`;
      await prisma.userNotification.deleteMany({ where: { userId: user.id } });
      await prisma.userIntegration.deleteMany({ where: { userId: user.id } });
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false, email: released, emailVerifiedAt: null, emailVerificationToken: null, emailVerificationExpiresAt: null, accountId: null, passwordHash: "" },
      });
      console.log(`  - soft-released User ${user.id} → email=${released}`);
    } else {
      // Cascade-deletable: notifications and integrations have onDelete:Cascade.
      await prisma.user.delete({ where: { id: user.id } });
      console.log(`  - deleted User ${user.id}`);
    }
  }

  // 3) Account row — only delete if no remaining linked rows.
  if (account) {
    const remainingUsers = await prisma.user.count({ where: { accountId: account.id } });
    const remainingClientUsers = await prisma.clientUser.count({ where: { accountId: account.id } });
    if (remainingUsers === 0 && remainingClientUsers === 0) {
      await prisma.account.delete({ where: { id: account.id } });
      console.log(`  - deleted Account ${account.id}`);
    } else {
      console.log(`  - Account ${account.id} still has ${remainingUsers} user(s) / ${remainingClientUsers} clientUser(s); skipping`);
    }
  }

  // 4) Verify
  console.log(`\n=== Verify ===`);
  const u2 = await prisma.user.findUnique({ where: { email: EMAIL } });
  const cu2 = await prisma.clientUser.findMany({ where: { email: EMAIL } });
  const a2 = await prisma.account.findUnique({ where: { email: EMAIL } });
  console.log(`User:        ${u2 ? "STILL EXISTS" : "gone"}`);
  console.log(`ClientUser:  ${cu2.length === 0 ? "gone" : `STILL EXISTS (${cu2.length})`}`);
  console.log(`Account:     ${a2 ? "STILL EXISTS" : "gone"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
