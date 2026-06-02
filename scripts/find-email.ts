/* eslint-disable no-console */
// Quick lookup: find ANY row (User or ClientUser) whose email matches
// the given substring (case-insensitive). Useful when the user thinks
// they registered with an address but the canonical form might differ
// (typo, plus-tag, capitalization, alternative domain).
//
// Usage:
//   npx tsx scripts/find-email.ts cuello.nicoo
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const needle = (process.argv[2] || "").trim().toLowerCase();
  if (!needle) {
    console.error("Usage: npx tsx scripts/find-email.ts <substring>");
    process.exit(1);
  }
  const users = await prisma.user.findMany({
    where: { email: { contains: needle, mode: "insensitive" } },
    select: { id: true, email: true, name: true, organizationId: true },
  });
  const cus = await prisma.clientUser.findMany({
    where: { email: { contains: needle, mode: "insensitive" } },
    select: { id: true, email: true, name: true, isActive: true, client: { select: { name: true } } },
  });
  console.log(`Agency Users (${users.length}):`);
  for (const u of users) console.log(`  ${u.id}  ${u.email}  ${u.name}  org=${u.organizationId}`);
  console.log(`ClientUsers (${cus.length}):`);
  for (const c of cus) console.log(`  ${c.id}  ${c.email}  ${c.name}  active=${c.isActive}  client=${c.client.name}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
