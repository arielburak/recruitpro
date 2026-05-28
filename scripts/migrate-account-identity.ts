/* eslint-disable no-console */
// PR 1 of the unified-identity refactor. Splits authentication off
// from User / ClientUser into a single Account table. After this
// runs, every row has its own Account 1:1 (because today the email
// columns are globally unique, so there's no collision to merge yet).
// Future PRs flip the read paths over to Account and start sharing
// Accounts across memberships.
//
// What this does:
//   1. Add Account table.
//   2. Add User.accountId + ClientUser.accountId (nullable).
//   3. Backfill: one Account per unique email across both tables. If
//      a User and a ClientUser already share an email (the case we
//      can't currently invite without erroring), they share the new
//      Account row — and the password / verification state is
//      reconciled to the most-recent one.
//   4. Add indexes on accountId.
//
// Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
// and the backfill only touches rows where accountId is still null.
//
// Run:
//   npx tsx scripts/migrate-account-identity.ts

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log("1. Creating Account table…");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Account" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT,
      "emailVerifiedAt" TIMESTAMP(3),
      "emailVerificationToken" TEXT,
      "emailVerificationExpiresAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Account_email_key" ON "Account"("email");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Account_emailVerificationToken_key" ON "Account"("emailVerificationToken");`
  );

  console.log("2. Adding accountId columns + indexes…");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountId" TEXT;`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "accountId" TEXT;`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "User_accountId_idx" ON "User"("accountId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ClientUser_accountId_idx" ON "ClientUser"("accountId");`
  );

  console.log("3. Backfilling Accounts from existing User + ClientUser…");
  // Pull both sides with the auth-relevant columns. The cuid() the
  // app uses is a Node-side helper, so we mint ids in TS rather than
  // expressing it in SQL.
  const users = await prisma.user.findMany({
    where: { accountId: null },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      emailVerifiedAt: true,
      emailVerificationToken: true,
      emailVerificationExpiresAt: true,
      updatedAt: true,
    },
  });
  const clientUsers = await prisma.clientUser.findMany({
    where: { accountId: null },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      emailVerifiedAt: true,
      emailVerificationToken: true,
      emailVerificationExpiresAt: true,
      updatedAt: true,
    },
  });

  // Normalize keys: lowercased email. If the same email lives on both
  // sides (today blocked by the unique constraint, but defensive),
  // we collapse to ONE Account and prefer the more-recently-updated
  // row's auth fields.
  type AuthShape = {
    email: string;
    passwordHash: string | null;
    emailVerifiedAt: Date | null;
    emailVerificationToken: string | null;
    emailVerificationExpiresAt: Date | null;
    updatedAt: Date;
  };
  const byEmail = new Map<string, AuthShape>();
  function fold(row: AuthShape) {
    const key = row.email.trim().toLowerCase();
    const prev = byEmail.get(key);
    if (!prev || row.updatedAt > prev.updatedAt) byEmail.set(key, { ...row, email: key });
  }
  for (const u of users) fold({ ...u, email: u.email });
  for (const c of clientUsers) fold({ ...c, email: c.email });

  let accountsCreated = 0;
  let accountsReused = 0;
  const accountIdByEmail = new Map<string, string>();
  for (const [email, row] of byEmail) {
    const existing = await prisma.account.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      accountIdByEmail.set(email, existing.id);
      accountsReused++;
      continue;
    }
    const created = await prisma.account.create({
      data: {
        email,
        passwordHash: row.passwordHash,
        emailVerifiedAt: row.emailVerifiedAt,
        emailVerificationToken: row.emailVerificationToken,
        emailVerificationExpiresAt: row.emailVerificationExpiresAt,
      },
      select: { id: true },
    });
    accountIdByEmail.set(email, created.id);
    accountsCreated++;
  }

  console.log("4. Linking User.accountId…");
  let usersLinked = 0;
  for (const u of users) {
    const accountId = accountIdByEmail.get(u.email.trim().toLowerCase());
    if (!accountId) continue;
    await prisma.user.update({ where: { id: u.id }, data: { accountId } });
    usersLinked++;
  }

  console.log("5. Linking ClientUser.accountId…");
  let clientUsersLinked = 0;
  for (const c of clientUsers) {
    const accountId = accountIdByEmail.get(c.email.trim().toLowerCase());
    if (!accountId) continue;
    await prisma.clientUser.update({ where: { id: c.id }, data: { accountId } });
    clientUsersLinked++;
  }

  console.log("");
  console.log("Done.");
  console.log(`  Accounts created : ${accountsCreated}`);
  console.log(`  Accounts reused  : ${accountsReused}`);
  console.log(`  Users linked     : ${usersLinked}`);
  console.log(`  ClientUsers      : ${clientUsersLinked}`);
  console.log("");
  console.log("Nothing in the app reads from Account yet — auth still");
  console.log("goes through User/ClientUser. Follow-up PRs flip the reads.");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
