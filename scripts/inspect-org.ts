/* eslint-disable no-console */
// Dump every org with name matching a substring + its createdAt and
// daysSinceSignup. Used when the migration banner doesn't appear
// for a user we think is fresh.
//
// Usage:
//   npx tsx scripts/inspect-org.ts "newells"
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const needle = (process.argv[2] || "").trim().toLowerCase();
  if (!needle) {
    console.error("Usage: npx tsx scripts/inspect-org.ts <name-substring>");
    process.exit(1);
  }
  const orgs = await prisma.organization.findMany({
    where: { name: { contains: needle, mode: "insensitive" } },
    select: {
      id: true, name: true, slug: true, createdAt: true,
      users: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  console.log(`Found ${orgs.length} org(s):`);
  for (const o of orgs) {
    const ageDays = Math.floor((now - o.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`  ${o.id}  "${o.name}"  created=${o.createdAt.toISOString()}  ageDays=${ageDays}`);
    for (const u of o.users) console.log(`    user: ${u.email} (${u.name})`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
