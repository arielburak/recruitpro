/* eslint-disable no-console */
// Adds the OrganizationClient join table and backfills it from the
// existing Client.organizationId column. After this runs, agency-side
// listing/access checks should query the join instead of
// Client.organizationId — the column itself stays as audit metadata.
//
// Idempotent: IF NOT EXISTS guards + an INSERT ... ON CONFLICT DO
// NOTHING for the backfill, so the staging deploy's prisma db push
// can re-run this safely.
//
// Run:
//   npx tsx scripts/migrate-organization-client.ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Creating OrganizationClient table…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OrganizationClient" (
      "id" TEXT NOT NULL,
      "organizationId" TEXT NOT NULL,
      "clientId" TEXT NOT NULL,
      "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OrganizationClient_pkey" PRIMARY KEY ("id")
    );
  `);

  console.log("Adding foreign keys + cascades…");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "OrganizationClient"
        ADD CONSTRAINT "OrganizationClient_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "OrganizationClient"
        ADD CONSTRAINT "OrganizationClient_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  console.log("Indexes…");
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationClient_organizationId_clientId_key"
    ON "OrganizationClient"("organizationId", "clientId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OrganizationClient_organizationId_idx"
    ON "OrganizationClient"("organizationId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OrganizationClient_clientId_idx"
    ON "OrganizationClient"("clientId");
  `);

  // Backfill: every Client today is "owned" by exactly one Org via
  // Client.organizationId. Create the matching engagement so the new
  // join-based queries don't silently lose any client.
  console.log("Backfilling engagements from Client.organizationId…");
  const result: any = await prisma.$executeRawUnsafe(`
    INSERT INTO "OrganizationClient" ("id", "organizationId", "clientId", "addedAt")
    SELECT
      'oc_' || substr(md5(random()::text || c.id), 1, 24) AS id,
      c."organizationId",
      c."id",
      COALESCE(c."createdAt", CURRENT_TIMESTAMP) AS addedAt
    FROM "Client" c
    WHERE c."organizationId" IS NOT NULL
    ON CONFLICT ("organizationId", "clientId") DO NOTHING;
  `);
  console.log(`  Backfilled ${result} engagement row(s).`);

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
