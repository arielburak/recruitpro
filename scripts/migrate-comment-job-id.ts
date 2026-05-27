/* eslint-disable no-console */
// Adds Comment.jobId so the new chat-style Notes tab on /jobs/[id]
// can attach comments at the job level (separately from per-submission
// chats). Backfills the one row of legacy Job.notes (from PR #179) as
// a Comment so the recruiter doesn't lose what they wrote.
//
// Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS,
// and the backfill checks for existing legacy-comment rows.
//
// Run:
//   npx tsx scripts/migrate-comment-job-id.ts

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

const LEGACY_MARKER = "[migrated from Job.notes]";

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding Comment.jobId…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "jobId" TEXT;`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Comment_jobId_idx" ON "Comment" ("jobId");`
  );

  // Backfill: every Job.notes value that hasn't already been migrated
  // becomes a Comment authored by the job's first assignment (or
  // organization owner if none). Marker in content so re-running
  // doesn't duplicate.
  console.log("Backfilling Job.notes → Comment…");
  const jobs = await prisma.job.findMany({
    where: { notes: { not: null } },
    select: {
      id: true,
      notes: true,
      organizationId: true,
      assignments: { select: { userId: true }, take: 1 },
    },
  });
  let created = 0;
  for (const j of jobs) {
    if (!j.notes) continue;
    const already = await prisma.comment.findFirst({
      where: { jobId: j.id, content: { contains: LEGACY_MARKER } },
      select: { id: true },
    });
    if (already) continue;
    // Fall back to the org's first admin if no assignment exists.
    let authorId = j.assignments[0]?.userId;
    if (!authorId) {
      const admin = await prisma.user.findFirst({
        where: { organizationId: j.organizationId, role: "ADMIN" },
        select: { id: true },
      });
      authorId = admin?.id;
    }
    if (!authorId) {
      console.log(`  skipping job ${j.id} (no author found)`);
      continue;
    }
    await prisma.comment.create({
      data: {
        content: `${j.notes}\n\n${LEGACY_MARKER}`,
        type: "INTERNAL",
        jobId: j.id,
        userId: authorId,
      },
    });
    created++;
  }
  console.log(`Done. Created ${created} backfilled comment(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
