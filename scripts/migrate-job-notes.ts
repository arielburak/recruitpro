/* eslint-disable no-console */
// Adds free-form `notes` columns to Job and ClientJob so both portals
// have a private scratchpad scoped per job. Agency notes never sync
// to the client side and vice versa — see prisma/schema.prisma.
//
// Idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.
//
// Run:
//   npx tsx scripts/migrate-job-notes.ts

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding Job.notes…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "notes" TEXT;`
  );

  console.log("Adding ClientJob.notes…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ClientJob" ADD COLUMN IF NOT EXISTS "notes" TEXT;`
  );

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
