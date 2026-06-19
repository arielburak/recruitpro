import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  const email = "nicolas@alphabridgepartners.com";

  const user = await prisma.user.findUnique({
    where: { email },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!user) {
    console.log(`User ${email} not found`);
    process.exit(0);
  }
  console.log(`User: ${user.id}  name=${user.name}  org="${user.organization.name}" (${user.organization.id})\n`);
  const orgId = user.organization.id;

  // Engagements scoped to this org
  const engagements = await prisma.firmEngagement.findMany({
    where: { organizationId: orgId },
    include: {
      clientJob: { select: { title: true, client: { select: { name: true } } } },
    },
    orderBy: { invitedAt: "desc" },
  });
  console.log(`FirmEngagement rows on this org (${engagements.length}):`);
  for (const e of engagements) {
    console.log(`  ${e.id}  status=${e.status}  invitedEmail=${e.invitedEmail}  invitedUserId=${e.invitedUserId}  jobId=${e.jobId}  client="${e.clientJob.client.name}"  job="${e.clientJob.title}"`);
  }

  // Clients on this org
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\nClient rows on this org (${clients.length}):`);
  for (const c of clients) {
    console.log(`  ${c.id}  name="${c.name}"  createdAt=${c.createdAt.toISOString()}`);
  }

  // Jobs on this org
  const jobs = await prisma.job.findMany({
    where: { organizationId: orgId },
    select: { id: true, title: true, clientId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\nJob rows on this org (${jobs.length}):`);
  for (const j of jobs) {
    console.log(`  ${j.id}  title="${j.title}"  clientId=${j.clientId}  createdAt=${j.createdAt.toISOString()}`);
  }

  // Contacts on this org
  const contacts = await prisma.contact.findMany({
    where: { organizationId: orgId },
    select: { id: true, firstName: true, lastName: true, email: true, title: true, isPrimary: true, clientId: true },
  });
  console.log(`\nContact rows on this org (${contacts.length}):`);
  for (const c of contacts) {
    console.log(`  ${c.id}  ${c.firstName} ${c.lastName} (${c.title || "—"})  email=${c.email}  clientId=${c.clientId}  primary=${c.isPrimary}`);
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
