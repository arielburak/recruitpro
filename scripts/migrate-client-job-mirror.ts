/* eslint-disable no-console */
// Adds ClientJob.createdByAgency + ClientJob.sourceJobId so the
// "Invite Client" flow on /jobs/[id] can mirror an agency Job over
// to the client portal as a read-only ClientJob. Existing rows
// default to createdByAgency=false / sourceJobId=null, which matches
// the historical semantics ("everything in the portal was authored
// by a client user").
//
// Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT
// EXISTS. Safe to re-run.
//
// Run:
//   npx tsx scripts/migrate-client-job-mirror.ts

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding ClientJob.createdByAgency…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ClientJob" ADD COLUMN IF NOT EXISTS "createdByAgency" BOOLEAN NOT NULL DEFAULT false;`
  );
  console.log("Adding ClientJob.sourceJobId…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ClientJob" ADD COLUMN IF NOT EXISTS "sourceJobId" TEXT;`
  );
  console.log("Indexing ClientJob.sourceJobId…");
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ClientJob_sourceJobId_key" ON "ClientJob"("sourceJobId");`
  );
  console.log("Adding FK to Job(id) with onDelete SET NULL…");
  // Wrap in DO block so re-running doesn't blow up when the FK already
  // exists; Postgres has no ADD CONSTRAINT IF NOT EXISTS.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ClientJob_sourceJobId_fkey'
      ) THEN
        ALTER TABLE "ClientJob"
        ADD CONSTRAINT "ClientJob_sourceJobId_fkey"
        FOREIGN KEY ("sourceJobId") REFERENCES "Job"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
