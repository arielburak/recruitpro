import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// One-shot backfill: every accepted FirmEngagement should have a
// matching OrganizationClient pivot. The accept handler used to skip
// this row, so the agency's Clients listing came back empty. Fixed
// forward; this script catches anyone already engaged before the fix.
(async () => {
  const accepted = await prisma.firmEngagement.findMany({
    where: { status: "ACCEPTED", jobId: { not: null } },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { name: true } },
      job: { select: { clientId: true } },
      clientJob: { select: { client: { select: { name: true } } } },
    },
  });

  let created = 0;
  let skipped = 0;
  for (const e of accepted) {
    if (!e.job?.clientId) {
      console.log(`  skip ${e.id}: no jobId/clientId resolved`);
      skipped++;
      continue;
    }
    const existing = await prisma.organizationClient.findUnique({
      where: {
        organizationId_clientId: {
          organizationId: e.organizationId,
          clientId: e.job.clientId,
        },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.organizationClient.create({
      data: { organizationId: e.organizationId, clientId: e.job.clientId },
    });
    created++;
    console.log(`  +OrganizationClient: org="${e.organization.name}" → client="${e.clientJob.client.name}"`);
  }
  console.log(`\nBackfilled ${created} pivot row(s). ${skipped} already had it / skipped.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
