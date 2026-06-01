/* eslint-disable no-console */
// One-off inspector: lists ClientJob rows authored by ClientUsers
// whose email matches the argument. Useful before running
// delete-clientuser-by-email.ts so the operator knows what
// downstream content gets impacted.
//
//   npx tsx scripts/inspect-clientuser-content.ts user@example.com

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const email = (process.argv[2] || "").trim();
  if (!email) {
    console.error("Usage: npx tsx scripts/inspect-clientuser-content.ts <email>");
    process.exit(1);
  }

  const clientUsers = await prisma.clientUser.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, clientId: true, client: { select: { name: true } } },
  });

  if (clientUsers.length === 0) {
    console.log("No ClientUser rows.");
    await prisma.$disconnect();
    return;
  }

  const ids = clientUsers.map((cu) => cu.id);

  const authoredJobs = await prisma.clientJob.findMany({
    where: { postedById: { in: ids } },
    select: {
      id: true,
      title: true,
      clientId: true,
      client: { select: { name: true } },
      createdAt: true,
      engagements: {
        select: { id: true, organizationId: true, status: true, jobId: true },
      },
    },
  });

  console.log(`\nClientUsers for ${email}: ${clientUsers.length}`);
  for (const cu of clientUsers) {
    console.log(`  - ${cu.id} client="${cu.client.name}"`);
  }
  console.log(`\nClientJobs authored: ${authoredJobs.length}`);
  for (const j of authoredJobs) {
    console.log(
      `  - ${j.id} title="${j.title}" client="${j.client.name}" engagements=${j.engagements.length} createdAt=${j.createdAt.toISOString()}`,
    );
    for (const e of j.engagements) {
      console.log(`      engagement=${e.id} status=${e.status} agency=${e.organizationId} jobId=${e.jobId || "—"}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
