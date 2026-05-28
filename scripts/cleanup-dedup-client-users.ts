/* eslint-disable no-console */
// Hard-delete ClientUser rows whose email contains the "+dedup-"
// marker left over by an earlier cleanup script. Those rows have
// already had their references (comments, ratings, ClientJobMember,
// ClientJob.postedById) reassigned to the canonical ClientUser, so
// dropping the leftover is safe.
//
// Dry-run by default. --apply to execute.

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../lib/prisma");

  const stale = await prisma.clientUser.findMany({
    where: { email: { contains: "+dedup-" } },
    select: { id: true, email: true, name: true, clientId: true },
  });

  console.log(`Found ${stale.length} dedup'd ClientUser row(s).`);
  for (const u of stale) {
    console.log(`  ${apply ? "✓ drop" : "would drop"}  "${u.name}" <${u.email}> [id=${u.id}]`);
  }

  if (!apply) {
    console.log("\nDry-run. Add --apply to delete.");
    await prisma.$disconnect();
    return;
  }
  if (stale.length === 0) {
    console.log("\nNothing to do.");
    await prisma.$disconnect();
    return;
  }

  // Safety: make sure no foreign key still points at any of them
  // before we hard-delete. Anything left over means the previous
  // reassign step missed a table.
  for (const u of stale) {
    const dangling = await Promise.all([
      prisma.comment.count({ where: { clientUserId: u.id } }),
      prisma.candidateRating.count({ where: { clientUserId: u.id } }),
      prisma.clientNotification.count({ where: { clientUserId: u.id } }),
      prisma.clientJobMember.count({ where: { clientUserId: u.id } }),
      prisma.clientJob.count({ where: { postedById: u.id } }),
    ]);
    const sum = dangling.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      console.error(
        `  ! refusing to drop ${u.id} — ${sum} FK row(s) still point at it. Re-run the merge script first.`
      );
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const ids = stale.map((u) => u.id);
  const result = await prisma.clientUser.deleteMany({ where: { id: { in: ids } } });
  console.log(`\nDropped ${result.count} dedup'd ClientUser row(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
