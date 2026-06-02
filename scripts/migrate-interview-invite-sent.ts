/* eslint-disable no-console */
// Adds Interview.inviteSent so the calendar UI can show whether the
// candidate was actually emailed at create time. Idempotent — safe
// to re-run.
//
// Run:
//   npx tsx scripts/migrate-interview-invite-sent.ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding Interview.inviteSent…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "inviteSent" BOOLEAN NOT NULL DEFAULT false;`
  );

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
