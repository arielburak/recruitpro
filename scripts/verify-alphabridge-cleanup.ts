import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  const orgId = "cmq6pqugk000004l2got32re6";
  const email = "nicolas@alphabridgepartners.com";

  const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
  console.log("Subscription:", sub ? "EXISTS" : "gone");

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  console.log("Organization 'Leo Messi Firm':", org ? "EXISTS" : "gone");

  const u = await prisma.user.findUnique({ where: { email } });
  console.log(`User ${email}:`, u ? "EXISTS" : "gone");

  const cu = await prisma.clientUser.findMany({ where: { email } });
  console.log("ClientUser rows:", cu.length);

  const a = await prisma.account.findUnique({ where: { email } });
  console.log("Account:", a ? "EXISTS" : "gone");

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
