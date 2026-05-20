/* eslint-disable no-console */
// QA helper: remove every ClientUser row (across all Clients) for a
// given email so the address can re-register from scratch. Keeps the
// Client(s) themselves around — if the email was the only member of
// a Client, the Client just becomes empty (cheap and harmless).
//
// Usage:
//   npx tsx scripts/delete-clientuser-by-email.ts user@example.com
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/delete-clientuser-by-email.ts <email>");
    process.exit(1);
  }

  const rows = await prisma.clientUser.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true, email: true, name: true, clientId: true, isActive: true,
      client: { select: { name: true } },
    },
  });
  if (rows.length === 0) {
    console.log(`No ClientUser rows for ${email}. Done.`);
    await prisma.$disconnect();
    return;
  }
  console.log(`Found ${rows.length} ClientUser row(s):`);
  for (const r of rows) {
    console.log(`  - ${r.id}  client=${r.client.name}  active=${r.isActive}  ${r.name}`);
  }

  const ids = rows.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    // Strict per-user dependents.
    const delComments = await tx.comment.deleteMany({
      where: { clientUserId: { in: ids } },
    });
    const delRatings = await tx.candidateRating.deleteMany({
      where: { clientUserId: { in: ids } },
    });
    const delNotifs = await tx.clientNotification.deleteMany({
      where: { clientUserId: { in: ids } },
    });
    // ClientJob.postedBy points at ClientUser too — null it out instead
    // of deleting the job, since the job may have engagements and
    // candidate activity behind it.
    const cleared = await tx.clientJob.updateMany({
      where: { postedBy: { in: ids } },
      data: { postedBy: null },
    });
    const del = await tx.clientUser.deleteMany({ where: { id: { in: ids } } });
    console.log(
      `Deleted: ${del.count} ClientUser, ${delComments.count} comments, ` +
      `${delRatings.count} ratings, ${delNotifs.count} notifications. ` +
      `Cleared ${cleared.count} ClientJob.postedBy references.`
    );
  });

  console.log(`${email} can register from scratch now.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
