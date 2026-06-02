/* eslint-disable no-console */
// One-off: report the size of an Organization (resolved via a User's
// email) so the operator can decide whether nuking it via
// delete-test-account.ts is safe.
//
//   npx tsx scripts/inspect-org-by-email.ts <user-email>

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const email = (process.argv[2] || "").trim();
  if (!email) {
    console.error("Usage: npx tsx scripts/inspect-org-by-email.ts <email>");
    process.exit(1);
  }

  const u = await prisma.user.findUnique({
    where: { email },
    select: { organizationId: true, organization: { select: { name: true } } },
  });
  if (!u) {
    console.log("No User with that email.");
    await prisma.$disconnect();
    return;
  }

  const orgId = u.organizationId;
  const [users, candidates, jobs, placements, clients, interviews, activities] = await Promise.all([
    prisma.user.count({ where: { organizationId: orgId } }),
    prisma.candidate.count({ where: { organizationId: orgId } }),
    prisma.job.count({ where: { organizationId: orgId } }),
    prisma.placement.count({ where: { organizationId: orgId } }),
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.interview.count({ where: { organizationId: orgId } }),
    prisma.activity.count({ where: { organizationId: orgId } }),
  ]);

  console.log(`\nOrganization: ${u.organization.name} (${orgId})`);
  console.log(`  Users:       ${users}`);
  console.log(`  Candidates:  ${candidates}`);
  console.log(`  Jobs:        ${jobs}`);
  console.log(`  Placements:  ${placements}`);
  console.log(`  Clients:     ${clients}`);
  console.log(`  Interviews:  ${interviews}`);
  console.log(`  Activities:  ${activities}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
