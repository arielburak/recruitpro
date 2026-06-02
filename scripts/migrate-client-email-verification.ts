/* eslint-disable no-console */
// Applies the ClientUser email-verification columns via the Neon
// HTTPS adapter (the Prisma CLI's TCP path doesn't work from this
// sandbox). Idempotent — uses IF NOT EXISTS so a re-run is safe
// after deploy applies the schema "for real" via prisma db push.
//
// Run:
//   npx tsx scripts/migrate-client-email-verification.ts
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("Adding columns to ClientUser…");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ClientUser"
    ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT,
    ADD COLUMN IF NOT EXISTS "emailVerificationExpiresAt" TIMESTAMP(3);
  `);
  console.log("Adding unique index on emailVerificationToken…");
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ClientUser_emailVerificationToken_key"
    ON "ClientUser"("emailVerificationToken");
  `);

  // Backfill: existing rows are pre-existing accounts that have been
  // operating fine — mark them as verified so the new hard-block in
  // the credentials provider doesn't lock anyone out. We only stamp
  // rows with a passwordHash (invited-but-not-activated rows stay
  // null so they go through set-password as usual).
  console.log("Backfilling emailVerifiedAt for existing accounts with a password…");
  const result: any = await prisma.$executeRawUnsafe(`
    UPDATE "ClientUser"
    SET "emailVerifiedAt" = "createdAt"
    WHERE "passwordHash" IS NOT NULL AND "emailVerifiedAt" IS NULL;
  `);
  console.log(`  Backfilled ${result} row(s).`);
  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
