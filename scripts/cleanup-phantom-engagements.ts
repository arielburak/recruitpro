/* eslint-disable no-console */
// Drops "phantom" OrganizationClient rows — engagements where the
// Client has zero data tied to this org (no Contact, no Job, no
// Placement, no ClientUser). Those were created accidentally by an
// earlier buggy version of scripts/merge-duplicate-clients.ts that
// folded orphans by name only.
//
// We never touch the Client row itself. The shared-Client model
// means a row could belong to other agencies; we only sever this
// agency's engagement.
//
// Dry-run by default. Add --apply to execute.
//
//   npx tsx scripts/cleanup-phantom-engagements.ts --org=<id>
//   npx tsx scripts/cleanup-phantom-engagements.ts --org=<id> --apply

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const apply = process.argv.includes("--apply");
  const orgArg = process.argv.find((a) => a.startsWith("--org="))?.slice(6);
  if (!orgArg) {
    console.error("Usage: npx tsx scripts/cleanup-phantom-engagements.ts --org=<id> [--apply]");
    process.exit(1);
  }

  const { prisma } = await import("../lib/prisma");

  const engagements = await prisma.organizationClient.findMany({
    where: { organizationId: orgArg },
    select: {
      id: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });

  console.log(`${engagements.length} engagement(s) for org ${orgArg}`);
  console.log("Checking each for attached data…\n");

  const phantoms: { id: string; clientId: string; name: string }[] = [];
  for (const e of engagements) {
    const [contacts, jobs, placements, clientUsers] = await Promise.all([
      prisma.contact.count({ where: { clientId: e.clientId, organizationId: orgArg } }),
      prisma.job.count({ where: { clientId: e.clientId, organizationId: orgArg } }),
      prisma.placement.count({ where: { clientId: e.clientId, organizationId: orgArg } }),
      prisma.clientUser.count({ where: { clientId: e.clientId } }),
    ]);
    const isPhantom =
      contacts === 0 && jobs === 0 && placements === 0 && clientUsers === 0;
    if (isPhantom) {
      phantoms.push({ id: e.id, clientId: e.clientId, name: e.client.name });
    }
  }

  console.log(`Real engagements: ${engagements.length - phantoms.length}`);
  console.log(`Phantom engagements: ${phantoms.length}\n`);
  for (const p of phantoms) {
    console.log(`  ${apply ? "✓ drop" : "would drop"}  "${p.name}" [client=${p.clientId}, engagement=${p.id}]`);
  }

  if (!apply) {
    console.log(`\nDry-run: re-run with --apply to delete the ${phantoms.length} phantom engagement(s).`);
    console.log("Client rows are NOT touched — only this org's link to them.");
    await prisma.$disconnect();
    return;
  }

  if (phantoms.length === 0) {
    console.log("\nNothing to do.");
    await prisma.$disconnect();
    return;
  }

  // Delete in chunks so we don't blow the query size on huge orgs.
  const ids = phantoms.map((p) => p.id);
  const CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const res = await prisma.organizationClient.deleteMany({
      where: { id: { in: slice } },
    });
    deleted += res.count;
  }
  console.log(`\nDone. Dropped ${deleted} phantom engagement(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
