import { prisma } from "../lib/prisma";

async function main() {
  console.log("Migrating roles...");

  // Step 1: PARTNER and RECRUITER → USER
  const userUpdate = await prisma.user.updateMany({
    where: { role: { in: ["PARTNER", "RECRUITER"] } },
    data: { role: "USER" },
  });
  console.log("Users migrated to USER:", userUpdate.count);

  // Step 2: Every organization needs at least 1 ADMIN
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    const admins = await prisma.user.count({
      where: { organizationId: org.id, role: "ADMIN", isActive: true },
    });
    if (admins === 0) {
      const oldest = await prisma.user.findFirst({
        where: { organizationId: org.id, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (oldest) {
        await prisma.user.update({ where: { id: oldest.id }, data: { role: "ADMIN" } });
        console.log(`Promoted staffing admin: ${oldest.email} (org: ${org.name})`);
      }
    }
  }

  // Step 3: Every Client needs at least 1 ADMIN
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  for (const client of clients) {
    const admins = await prisma.clientUser.count({
      where: { clientId: client.id, role: "ADMIN", isActive: true },
    });
    if (admins === 0) {
      const oldest = await prisma.clientUser.findFirst({
        where: { clientId: client.id, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (oldest) {
        await prisma.clientUser.update({ where: { id: oldest.id }, data: { role: "ADMIN" } });
        console.log(`Promoted client admin: ${oldest.email} (client: ${client.name})`);
      }
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
