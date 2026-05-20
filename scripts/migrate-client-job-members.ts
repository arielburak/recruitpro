/* eslint-disable no-console */
// Applies the ClientJobMember table + indexes via the Neon HTTPS
// adapter (Prisma CLI's TCP path doesn't work from this sandbox).
// Idempotent: uses IF NOT EXISTS so a re-run after the staging deploy
// applies the schema for real is a no-op.
//
// Run:
//   npx tsx scripts/migrate-client-job-members.ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Creating ClientJobMember table…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ClientJobMember" (
      "id" TEXT NOT NULL,
      "clientJobId" TEXT NOT NULL,
      "clientUserId" TEXT NOT NULL,
      "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ClientJobMember_pkey" PRIMARY KEY ("id")
    );
  `);

  console.log("Adding foreign keys + cascade rules…");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ClientJobMember"
        ADD CONSTRAINT "ClientJobMember_clientJobId_fkey"
        FOREIGN KEY ("clientJobId") REFERENCES "ClientJob"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ClientJobMember"
        ADD CONSTRAINT "ClientJobMember_clientUserId_fkey"
        FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  console.log("Adding unique + lookup indexes…");
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ClientJobMember_clientJobId_clientUserId_key"
    ON "ClientJobMember"("clientJobId", "clientUserId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ClientJobMember_clientJobId_idx"
    ON "ClientJobMember"("clientJobId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ClientJobMember_clientUserId_idx"
    ON "ClientJobMember"("clientUserId");
  `);

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
