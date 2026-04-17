import { prisma } from "../lib/prisma";

async function main() {
  const email = "ncuello@morabits.net";
  const u = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
    select: { email: true, role: true, organization: { select: { name: true } } },
  });
  console.log("Promoted to ADMIN:", u);
}

main().catch(console.error).finally(() => prisma.$disconnect());
