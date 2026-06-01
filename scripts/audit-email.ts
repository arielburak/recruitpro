/* eslint-disable no-console */
// Read-only audit: report every place a given email exists across the
// auth surfaces so we can decide what to clean up before running an
// actual delete. Does NOT mutate anything.
//
// Usage:
//   npx tsx scripts/audit-email.ts user@example.com

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: npx tsx scripts/audit-email.ts <email>");
    process.exit(1);
  }
  const email = raw.trim();

  const users = await prisma.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true, email: true, name: true, role: true, organizationId: true,
      organization: { select: { name: true } },
    },
  });
  const clientUsers = await prisma.clientUser.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true, email: true, name: true, role: true, isActive: true,
      clientId: true, client: { select: { name: true } },
    },
  });
  const contacts = await prisma.contact.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      clientId: true, client: { select: { name: true } },
    },
  });
  const accounts = await prisma.account.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, createdAt: true },
  });
  const userInvites = await prisma.userInvite.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, organizationId: true, usedAt: true },
  });
  const pendingFirmInvites = await prisma.pendingFirmInvite.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, clientJobId: true },
  });

  // ClientUser-keyed dependents (only counted if we found ClientUser rows).
  const clientUserIds = clientUsers.map((c) => c.id);
  const [members, notifs, comments, ratings, postedJobs] =
    clientUserIds.length > 0
      ? await Promise.all([
          prisma.clientJobMember.count({
            where: { clientUserId: { in: clientUserIds } },
          }),
          prisma.clientNotification.count({
            where: { clientUserId: { in: clientUserIds } },
          }),
          prisma.comment.count({
            where: { clientUserId: { in: clientUserIds } },
          }),
          prisma.candidateRating.count({
            where: { clientUserId: { in: clientUserIds } },
          }),
          prisma.clientJob.count({
            where: { postedById: { in: clientUserIds } },
          }),
        ])
      : [0, 0, 0, 0, 0];

  console.log(`\n=== Audit for ${email} ===\n`);

  console.log(`User (agency-side): ${users.length}`);
  for (const u of users) {
    console.log(
      `  - ${u.id}  name="${u.name}"  role=${u.role}  org="${u.organization.name}" (${u.organizationId})`,
    );
  }

  console.log(`\nClientUser (client-portal-side): ${clientUsers.length}`);
  for (const cu of clientUsers) {
    console.log(
      `  - ${cu.id}  name="${cu.name}"  role=${cu.role}  active=${cu.isActive}  client="${cu.client.name}" (${cu.clientId})`,
    );
  }

  console.log(`\nContact (CRM-side, hiring contacts at clients): ${contacts.length}`);
  for (const c of contacts) {
    console.log(
      `  - ${c.id}  name="${c.firstName} ${c.lastName}"  client="${c.client?.name || "—"}"`,
    );
  }

  console.log(`\nAccount (unified identity): ${accounts.length}`);
  for (const a of accounts) {
    console.log(`  - ${a.id}  created=${a.createdAt.toISOString()}`);
  }

  console.log(`\nUserInvite (pending invites for agency-side): ${userInvites.length}`);
  for (const i of userInvites) {
    console.log(
      `  - ${i.id}  used=${i.usedAt ? i.usedAt.toISOString() : "never"}  org=${i.organizationId}`,
    );
  }

  console.log(`\nPendingFirmInvite: ${pendingFirmInvites.length}`);
  for (const i of pendingFirmInvites) {
    console.log(`  - ${i.id}  clientJob=${i.clientJobId}`);
  }

  if (clientUserIds.length > 0) {
    console.log(`\nClientUser dependents (would be deleted / nullified):`);
    console.log(`  - ClientJobMember rows: ${members}`);
    console.log(`  - ClientNotification rows: ${notifs}`);
    console.log(`  - Comment rows: ${comments}`);
    console.log(`  - CandidateRating rows: ${ratings}`);
    console.log(`  - ClientJob.postedBy refs (would be nulled): ${postedJobs}`);
  }

  console.log(`\n=== End audit ===\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
