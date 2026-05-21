/* eslint-disable no-console */
// Add the interviewId column + FK + index to Document so an interview
// can carry attachments (agenda PDF, prep doc, NDA, etc.). Applied via
// the Neon HTTPS adapter — Prisma CLI's TCP path doesn't work from
// this sandbox. Idempotent.
//
// Run:
//   npx tsx scripts/migrate-interview-attachments.ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding interviewId column to Document…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Document"
    ADD COLUMN IF NOT EXISTS "interviewId" TEXT;
  `);

  console.log("Adding FK + cascade…");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Document"
        ADD CONSTRAINT "Document_interviewId_fkey"
        FOREIGN KEY ("interviewId") REFERENCES "Interview"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  console.log("Index…");
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Document_interviewId_idx"
    ON "Document"("interviewId");
  `);

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
