import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EMAIL = "aburak@lionpointpartners.com";

(async () => {
  console.log(`=== Tracing where ${EMAIL} can be picked up ===\n`);

  // 1. Does aburak have a User row (agency side)?
  const u = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { organization: { select: { name: true } } },
  });
  console.log(`User (agency side): ${u ? `EXISTS — org "${u.organization.name}" / ${u.id}` : "no"}`);

  // 2. ClientUser side
  const cu = await prisma.clientUser.findMany({
    where: { email: EMAIL },
    include: { client: { select: { name: true } } },
  });
  console.log(`ClientUser rows: ${cu.length}`);
  for (const c of cu) console.log(`  → client "${c.client.name}" / ${c.id}`);

  // 3. If User exists, list the JobAssignments and Submissions tied to it,
  //    plus the firm/org of those jobs.
  if (u) {
    const assigns = await prisma.jobAssignment.findMany({
      where: { userId: u.id },
      include: { job: { select: { title: true, organization: { select: { name: true } }, client: { select: { name: true } } } } },
    });
    console.log(`\nJobAssignments (${assigns.length}):`);
    for (const a of assigns) {
      console.log(`  job="${a.job.title}" · firm="${a.job.organization.name}" · client="${a.job.client?.name ?? "—"}"`);
    }

    const subs = await prisma.candidateSubmission.findMany({
      where: { submittedById: u.id },
      include: { job: { select: { title: true, organization: { select: { name: true } }, client: { select: { name: true } } } } },
    });
    console.log(`\nCandidateSubmissions submitted (${subs.length}):`);
    for (const s of subs) {
      console.log(`  job="${s.job.title}" · firm="${s.job.organization.name}" · client="${s.job.client?.name ?? "—"}"`);
    }
  }

  // 4. FirmEngagement rows where aburak is the invitedEmail
  const fe = await prisma.firmEngagement.findMany({
    where: { invitedEmail: { equals: EMAIL, mode: "insensitive" } },
    include: {
      organization: { select: { name: true } },
      clientJob: { select: { title: true, client: { select: { name: true } } } },
    },
  });
  console.log(`\nFirmEngagement.invitedEmail (${fe.length}):`);
  for (const e of fe) {
    console.log(`  firm-org="${e.organization.name}" · clientJob="${e.clientJob.title}" · client="${e.clientJob.client.name}" · status=${e.status}`);
  }

  // 5. PendingFirmInvite
  const pf = await prisma.pendingFirmInvite.findMany({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
    include: { client: { select: { name: true } } },
  });
  console.log(`\nPendingFirmInvite (${pf.length}):`);
  for (const p of pf) {
    console.log(`  client="${p.client.name}" · clientJobId=${p.clientJobId}`);
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
