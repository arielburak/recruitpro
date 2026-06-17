import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const oldClientId = "cmnwh74fo000004lebbz5fbcl"; // "Lionpoint" (duplicate test client)
  const email = "aburak@lionpointpartners.com";

  const client = await prisma.client.findUnique({
    where: { id: oldClientId },
    include: {
      clientUsers: true,
      clientJobs: { include: { engagements: true } },
    },
  });

  if (!client) {
    console.log("Old client not found");
    return;
  }

  console.log(`Deleting client "${client.name}" (${oldClientId})`);
  console.log(`  - ${client.clientUsers.length} users`);
  console.log(`  - ${client.clientJobs.length} jobs`);

  // Delete in proper order due to FK constraints
  // 1. Delete firm engagements
  for (const job of client.clientJobs) {
    if (job.engagements.length > 0) {
      await prisma.firmEngagement.deleteMany({ where: { clientJobId: job.id } });
      console.log(`  - Deleted ${job.engagements.length} engagements for job "${job.title}"`);
    }
  }

  // 2. Delete ClientJobs (they reference ClientUser.postedById)
  await prisma.clientJob.deleteMany({ where: { clientId: oldClientId } });
  console.log(`  - Deleted ClientJobs`);

  // 3. Delete ClientPortalTokens
  await prisma.clientPortalToken.deleteMany({ where: { clientId: oldClientId } });
  console.log(`  - Deleted ClientPortalTokens`);

  // 4. Delete ClientUsers
  await prisma.clientUser.deleteMany({ where: { clientId: oldClientId } });
  console.log(`  - Deleted ClientUsers`);

  // 5. Delete the Client itself (might have other dependencies)
  // Check first if there are recruiter-side Jobs referencing this client
  const recruiterJobs = await prisma.job.count({ where: { clientId: oldClientId } });
  if (recruiterJobs > 0) {
    console.log(`\n⚠️  Client still has ${recruiterJobs} recruiter-side Jobs. Not deleting Client record.`);
    console.log(`Only removed ClientUser records. The recruiter-side data is preserved.`);
  } else {
    await prisma.client.delete({ where: { id: oldClientId } });
    console.log(`  - Deleted Client`);
  }

  // Verify
  const remaining = await prisma.clientUser.findMany({
    where: { email },
    include: { client: { select: { name: true } } },
  });
  console.log("\n=== Remaining ClientUsers with email aburak@... ===");
  for (const u of remaining) {
    console.log(`  ${u.name} | clientId=${u.clientId} | ${u.client.name} | ${u.passwordHash ? "HAS_PWD" : "NO_PWD"}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
