/* eslint-disable no-console */
// Adds the `externalId` column to Candidate, Job, and OrganizationClient
// so bulk imports can re-wire candidate↔job pipeline relationships back
// to the right rows after the entities themselves land.
//
// Idempotent: ALTER TABLE … ADD COLUMN IF NOT EXISTS + CREATE UNIQUE
// INDEX IF NOT EXISTS, so it's safe to re-run.
//
// Run:
//   npx tsx scripts/migrate-external-ids.ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding Candidate.externalId…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "externalId" TEXT;`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Candidate_organizationId_externalId_key"
       ON "Candidate" ("organizationId", "externalId");`
  );

  console.log("Adding Job.externalId…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "externalId" TEXT;`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Job_organizationId_externalId_key"
       ON "Job" ("organizationId", "externalId");`
  );

  console.log("Adding OrganizationClient.externalId…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "OrganizationClient" ADD COLUMN IF NOT EXISTS "externalId" TEXT;`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationClient_organizationId_externalId_key"
       ON "OrganizationClient" ("organizationId", "externalId");`
  );

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
