import { prisma } from "../lib/prisma";

// One-shot: borra la org "Seleccion Argentina" (huérfana tras release de cuello.nico).
async function main() {
  const orgId = "cmqgvt7h4000004lblov0mjf3";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, _count: { select: { users: true } } },
  });

  if (!org) {
    console.log("Org ya borrada.");
    return;
  }

  console.log(`Org "${org.name}" — ${org._count.users} users`);
  if (org._count.users > 0) {
    console.log("Tiene users — abortando.");
    return;
  }

  // Subscription no es cascade — limpiar primero
  const subRes = await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
  console.log(`Subscriptions borradas: ${subRes.count}`);

  await prisma.organization.delete({ where: { id: orgId } });
  console.log("✓ Org borrada");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
