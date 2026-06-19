import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ORG_ID = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!ORG_ID) {
  console.error("Usage: tsx scripts/nuke-empty-org.ts <orgId> [--dry-run]");
  process.exit(1);
}

async function main() {
  const org = await prisma.organization.findUnique({
    where: { id: ORG_ID },
    include: {
      users: { select: { id: true, email: true, isActive: true } },
      clients: { select: { id: true } },
      candidates: { select: { id: true } },
      contacts: { select: { id: true } },
      jobs: { select: { id: true } },
      placements: { select: { id: true } },
      activities: { select: { id: true } },
      engagements: { select: { id: true } },
      interviews: { select: { id: true } },
      calendarEvents: { select: { id: true } },
      clientEngagements: { select: { id: true } },
      subscription: { select: { id: true } },
    },
  });

  if (!org) {
    console.log(`No org with id=${ORG_ID}`);
    return;
  }

  console.log(`Org "${org.name}" (${org.id} / ${org.slug})`);
  console.log(`  users=${org.users.length}  clients=${org.clients.length}  candidates=${org.candidates.length}  contacts=${org.contacts.length}`);
  console.log(`  jobs=${org.jobs.length}  placements=${org.placements.length}  activities=${org.activities.length}`);
  console.log(`  engagements=${org.engagements.length}  interviews=${org.interviews.length}  calendarEvents=${org.calendarEvents.length}`);
  console.log(`  clientEngagements=${org.clientEngagements.length}  subscription=${org.subscription ? "yes" : "no"}`);

  const totalRefs =
    org.users.length +
    org.clients.length +
    org.candidates.length +
    org.contacts.length +
    org.jobs.length +
    org.placements.length +
    org.activities.length +
    org.engagements.length +
    org.interviews.length +
    org.calendarEvents.length +
    org.clientEngagements.length +
    (org.subscription ? 1 : 0);

  if (totalRefs > 0) {
    console.log(`\n⚠️  Org has ${totalRefs} dependent rows — not deleting.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] would delete empty Org`);
    return;
  }

  await prisma.organization.delete({ where: { id: ORG_ID } });
  console.log(`\n✓ Deleted empty Org ${ORG_ID}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
