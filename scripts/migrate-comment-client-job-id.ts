/* eslint-disable no-console */
// Adds Comment.clientJobId so the client-portal job page can show a
// chat-style notes thread (mirroring the agency-side change in
// scripts/migrate-comment-job-id.ts). Backfills every existing
// ClientJob.notes string as a Comment authored by the original poster
// so the client doesn't lose what they wrote.
//
// Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS,
// and the backfill marker prevents duplicate comments on re-run.
//
// Run:
//   npx tsx scripts/migrate-comment-client-job-id.ts

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

const LEGACY_MARKER = "[migrated from ClientJob.notes]";

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding Comment.clientJobId…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "clientJobId" TEXT;`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Comment_clientJobId_idx" ON "Comment" ("clientJobId");`
  );

  console.log("Backfilling ClientJob.notes → Comment…");
  const jobs = await prisma.clientJob.findMany({
    where: { notes: { not: null } },
    select: { id: true, notes: true, postedById: true },
  });
  let created = 0;
  for (const j of jobs) {
    if (!j.notes) continue;
    const already = await prisma.comment.findFirst({
      where: { clientJobId: j.id, content: { contains: LEGACY_MARKER } },
      select: { id: true },
    });
    if (already) continue;
    await prisma.comment.create({
      data: {
        content: `${j.notes}\n\n${LEGACY_MARKER}`,
        type: "CLIENT_INTERNAL",
        clientJobId: j.id,
        clientUserId: j.postedById,
      },
    });
    created++;
  }
  console.log(`Done. Created ${created} backfilled comment(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
