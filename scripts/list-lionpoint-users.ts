import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const domain = "@lionpointpartners.com";

  const users = await prisma.user.findMany({
    where: { email: { contains: domain, mode: "insensitive" } },
    include: { organization: { select: { name: true } } },
  });
  console.log(`=== Staffing User rows with ${domain} (${users.length}) ===`);
  for (const u of users) {
    console.log(`  ${u.email}  | ${u.name}  | org="${u.organization.name}"  | active=${u.isActive}  | id=${u.id}`);
  }

  const cu = await prisma.clientUser.findMany({
    where: { email: { contains: domain, mode: "insensitive" } },
    include: { client: { select: { name: true } } },
  });
  console.log(`\n=== ClientUser rows with ${domain} (${cu.length}) ===`);
  for (const u of cu) {
    console.log(`  ${u.email}  | ${u.name}  | client="${u.client.name}"  | active=${u.isActive}  | id=${u.id}`);
  }

  const accs = await prisma.account.findMany({
    where: { email: { contains: domain, mode: "insensitive" } },
  });
  console.log(`\n=== Account rows with ${domain} (${accs.length}) ===`);
  for (const a of accs) {
    console.log(`  ${a.email}  | verified=${a.emailVerifiedAt?.toISOString() ?? "no"}  | id=${a.id}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
