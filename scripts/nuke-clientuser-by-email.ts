/* eslint-disable no-console */
// More aggressive variant of delete-clientuser-by-email: also wipes
// any ClientJob the user authored (and its FirmEngagement +
// downstream agency-side Job + everything they owned). Use when
// you really want the user gone with no archeology left behind.
//
//   npx tsx scripts/nuke-clientuser-by-email.ts user@example.com

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/nuke-clientuser-by-email.ts <email>");
    process.exit(1);
  }

  const clientUsers = await prisma.clientUser.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, clientId: true, client: { select: { name: true } } },
  });
  if (clientUsers.length === 0) {
    console.log(`No ClientUser rows for ${email}.`);
    await prisma.$disconnect();
    return;
  }
  const ids = clientUsers.map((c) => c.id);

  // Pre-compute the ClientJobs authored by these users so we can
  // also tear down the agency-side Jobs / engagements / pipeline
  // stages / submissions they spawned. Anything that wouldn't
  // cascade automatically from ClientJob.delete gets handled here.
  const authoredClientJobs = await prisma.clientJob.findMany({
    where: { postedById: { in: ids } },
    select: {
      id: true,
      title: true,
      clientId: true,
      engagements: {
        select: { id: true, jobId: true, organizationId: true },
      },
    },
  });

  console.log(
    `Found ${clientUsers.length} ClientUser(s) and ${authoredClientJobs.length} ClientJob(s) authored by them.`,
  );
  for (const u of clientUsers) {
    console.log(`  - ClientUser ${u.id} client="${u.client.name}" name="${u.name}"`);
  }
  for (const j of authoredClientJobs) {
    console.log(
      `  - ClientJob ${j.id} title="${j.title}" engagements=${j.engagements.length}`,
    );
  }

  // Collect agency-side Jobs spawned by engagements on these ClientJobs.
  // Those carry submissions, comments, pipeline stages, etc.
  const agencyJobIds = authoredClientJobs.flatMap((j) =>
    j.engagements.map((e) => e.jobId).filter((v): v is string => !!v),
  );

  await prisma.$transaction(async (tx: any) => {
    // 1) Strict per-user dependents on the ClientUser side.
    await tx.comment.deleteMany({ where: { clientUserId: { in: ids } } });
    await tx.candidateRating.deleteMany({ where: { clientUserId: { in: ids } } });
    await tx.clientNotification.deleteMany({ where: { clientUserId: { in: ids } } });
    await tx.clientJobMember.deleteMany({ where: { clientUserId: { in: ids } } });

    // 2) Tear down agency-side Jobs that came from these ClientJobs.
    if (agencyJobIds.length > 0) {
      const submissions = await tx.candidateSubmission.findMany({
        where: { jobId: { in: agencyJobIds } },
        select: { id: true },
      });
      const submissionIds = submissions.map((s: { id: string }) => s.id);
      await tx.candidateRating.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await tx.comment.deleteMany({ where: { submissionId: { in: submissionIds } } });

      const interviews = await tx.interview.findMany({
        where: { OR: [{ jobId: { in: agencyJobIds } }, { submissionId: { in: submissionIds } }] },
        select: { id: true },
      });
      const interviewIds = interviews.map((i: { id: string }) => i.id);
      await tx.interviewAssignment.deleteMany({ where: { interviewId: { in: interviewIds } } });
      await tx.interviewClientContact.deleteMany({ where: { interviewId: { in: interviewIds } } });
      await tx.interviewFeedback.deleteMany({ where: { interviewId: { in: interviewIds } } });
      await tx.interview.deleteMany({ where: { id: { in: interviewIds } } });

      await tx.placement.deleteMany({ where: { jobId: { in: agencyJobIds } } });
      await tx.candidateSubmission.deleteMany({ where: { id: { in: submissionIds } } });
      await tx.pipelineStage.deleteMany({ where: { jobId: { in: agencyJobIds } } });
      await tx.jobAssignment.deleteMany({ where: { jobId: { in: agencyJobIds } } });
      await tx.document.deleteMany({ where: { jobId: { in: agencyJobIds } } });
      await tx.comment.deleteMany({ where: { jobId: { in: agencyJobIds } } });
      await tx.firmEngagement.deleteMany({ where: { jobId: { in: agencyJobIds } } });
      await tx.job.deleteMany({ where: { id: { in: agencyJobIds } } });
    }

    // 3) Drop the authored ClientJobs (and anything that cascades from
    // them: pending invites, documents, etc., per schema).
    if (authoredClientJobs.length > 0) {
      await tx.firmEngagement.deleteMany({
        where: { clientJobId: { in: authoredClientJobs.map((j) => j.id) } },
      });
      await tx.clientJob.deleteMany({
        where: { id: { in: authoredClientJobs.map((j) => j.id) } },
      });
    }

    // 4) Finally, the ClientUser rows themselves.
    const del = await tx.clientUser.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted ${del.count} ClientUser(s).`);
  });

  console.log(`${email} cleaned from client portal. Can re-invite from scratch.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
