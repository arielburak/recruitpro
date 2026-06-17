import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  const orgId = "cmq6pqugk000004l2got32re6";

  const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
  if (sub) {
    await prisma.subscription.delete({ where: { id: sub.id } });
    console.log(`deleted Subscription ${sub.id}`);
  } else {
    console.log("no Subscription to delete");
  }

  await prisma.organization.delete({ where: { id: orgId } });
  console.log(`deleted Organization ${orgId}`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
