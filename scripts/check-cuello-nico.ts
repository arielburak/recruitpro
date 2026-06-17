import { prisma } from "../lib/prisma";

async function main() {
  const target = "cuello.nico@gmail.com";

  // 1. Buscar User por mail directo
  const direct = await prisma.user.findFirst({
    where: { email: target },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      organizationId: true,
      organization: { select: { name: true } },
      createdAt: true,
      emailVerifiedAt: true,
    },
  });

  // 2. Buscar User soft-released con released+ prefix (Gmail canonicalization)
  const released = await prisma.user.findMany({
    where: {
      email: { startsWith: "released+" },
      OR: [
        { name: { contains: "Cuello", mode: "insensitive" } },
        { name: { contains: "Nicolas", mode: "insensitive" } },
        { name: { contains: "Nicolás", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      organization: { select: { name: true } },
      createdAt: true,
    },
  });

  // 3. Buscar ClientUser por mismo mail
  const clientUser = await prisma.clientUser.findFirst({
    where: { email: target },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });

  console.log("=== User directo con email cuello.nico@gmail.com ===");
  console.log(direct || "(no existe)");

  console.log("\n=== Users soft-released (released+...) con nombre Cuello/Nicolas ===");
  if (released.length === 0) console.log("(no hay)");
  released.forEach((u) => console.log(u));

  console.log("\n=== ClientUser directo con email cuello.nico@gmail.com ===");
  console.log(clientUser || "(no existe)");

  // 4. Buscar PendingFirmInvite + UserInvite con ese email
  const pendingFirm = await prisma.pendingFirmInvite.findMany({
    where: { email: target },
    select: { id: true, email: true, clientId: true, createdAt: true },
  });
  const pendingUser = await prisma.userInvite.findMany({
    where: { email: target, usedAt: null },
    select: { id: true, email: true, role: true, organizationId: true, createdAt: true },
  });
  console.log("\n=== Pending invites para ese mail ===");
  console.log({ pendingFirm, pendingUser });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
