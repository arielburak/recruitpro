import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes("--dry-run");

// One-shot cleanup: FirmEngagement rows where invitedEmail belongs to
// a ClientUser of the SAME client as the job. Those are bogus
// person-level invites (typo: someone typed their own portal email
// into the "invite a recruiter" form) and they pollute the
// "previously engaged firms" dropdown.
//
// Fix: null out invitedEmail + invitedUserId. The engagement stays
// alive (the firm is genuinely working that job) but reverts to
// firm-level so the dropdown surfaces it as a legacy firm-only entry.
(async () => {
  console.log(`Scanning FirmEngagement for self-invites (DRY_RUN=${DRY_RUN})...\n`);

  // Find every FirmEngagement where invitedEmail matches a ClientUser
  // at the SAME client as the engagement's clientJob.
  const engagements = await prisma.firmEngagement.findMany({
    where: { invitedEmail: { not: null } },
    select: {
      id: true,
      invitedEmail: true,
      invitedUserId: true,
      clientJob: {
        select: {
          title: true,
          clientId: true,
          client: { select: { name: true } },
        },
      },
      organization: { select: { name: true } },
    },
  });

  const dirty: typeof engagements = [];
  for (const e of engagements) {
    if (!e.invitedEmail) continue;
    const match = await prisma.clientUser.findFirst({
      where: { email: e.invitedEmail, clientId: e.clientJob.clientId },
      select: { id: true },
    });
    if (match) dirty.push(e);
  }

  console.log(`Found ${dirty.length} dirty rows:\n`);
  for (const d of dirty) {
    console.log(
      `  ${d.id}  email=${d.invitedEmail}  firm="${d.organization.name}"  job="${d.clientJob.title}"  client="${d.clientJob.client.name}"`
    );
  }

  if (dirty.length === 0) {
    console.log("\n✓ Nothing to clean.");
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] would null invitedEmail + invitedUserId on ${dirty.length} row(s)`);
    return;
  }

  for (const d of dirty) {
    await prisma.firmEngagement.update({
      where: { id: d.id },
      data: { invitedEmail: null, invitedUserId: null },
    });
  }
  console.log(`\n✓ Cleaned ${dirty.length} row(s) — invitedEmail + invitedUserId set to null.`);
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
