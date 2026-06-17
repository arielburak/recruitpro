import { prisma } from "../lib/prisma";

// Libera el email cuello.nico@gmail.com:
// 1. Borra el User activo en "Seleccion Argentina"
// 2. Si esa org queda sin otros users activos, la borra también
//    (con todas sus dependencias en cascade)
// 3. Confirma que el email no aparece en User

async function main() {
  const targetEmail = "cuello.nico@gmail.com";

  const user = await prisma.user.findFirst({
    where: { email: targetEmail, isActive: true },
    include: { organization: { select: { id: true, name: true } } },
  });

  if (!user) {
    console.log(`No active user con email ${targetEmail}. Email ya libre.`);
    return;
  }

  console.log(`Found user: ${user.name} (${user.email}) @ ${user.organization.name} [${user.organization.id}]`);

  const orgId = user.organizationId;
  const orgName = user.organization.name;

  // Cuento otros users activos del mismo org
  const otherUsersCount = await prisma.user.count({
    where: { organizationId: orgId, id: { not: user.id }, isActive: true },
  });

  console.log(`Otros users activos en "${orgName}": ${otherUsersCount}`);

  // Inventario de qué cuelga del user (para log)
  const counts = {
    candidates: await prisma.candidate.count({ where: { ownerId: user.id } }),
    jobAssignments: await prisma.jobAssignment.count({ where: { userId: user.id } }),
    submissions: await prisma.candidateSubmission.count({ where: { submittedBy: user.id } }),
    comments: await prisma.comment.count({ where: { userId: user.id } }),
    activities: await prisma.activity.count({ where: { userId: user.id } }),
    notifications: await prisma.userNotification.count({ where: { userId: user.id } }),
    sentInvites: await prisma.userInvite.count({ where: { invitedById: user.id } }),
  };
  console.log("Inventario user:", counts);

  // Siempre borramos el user primero — su User.organizationId NO es
  // cascade, asi que la org no se puede borrar mientras el user existe.
  console.log("\nBorrando User...");
  await prisma.user.delete({ where: { id: user.id } });
  console.log("✓ User borrado");

  if (otherUsersCount === 0) {
    const orgCounts = {
      jobs: await prisma.job.count({ where: { organizationId: orgId } }),
      candidates: await prisma.candidate.count({ where: { organizationId: orgId } }),
      orgClients: await prisma.organizationClient.count({ where: { organizationId: orgId } }),
      contacts: await prisma.contact.count({ where: { organizationId: orgId } }),
      activities: await prisma.activity.count({ where: { organizationId: orgId } }),
      userInvites: await prisma.userInvite.count({ where: { organizationId: orgId } }),
      stages: await prisma.pipelineStage.count({ where: { job: { organizationId: orgId } } }),
    };
    console.log("Inventario org (sin user):", orgCounts);

    // Pre-cleanup de dependencias no-cascade
    await prisma.subscription
      .deleteMany({ where: { organizationId: orgId } })
      .catch(() => {});

    console.log(`\nBorrando org "${orgName}"...`);
    await prisma.organization.delete({ where: { id: orgId } });
    console.log("✓ Org borrada");
  } else {
    console.log(`Org "${orgName}" tiene ${otherUsersCount} otros users — la dejo viva.`);
  }

  // Verificar email libre
  const stillThere = await prisma.user.findFirst({
    where: { email: targetEmail },
  });
  console.log(`\nEmail ${targetEmail} todavía existe en User?:`, !!stillThere);

  // ClientUser por si acaso
  const cu = await prisma.clientUser.findFirst({
    where: { email: targetEmail },
  });
  console.log(`Email ${targetEmail} todavía existe en ClientUser?:`, !!cu);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  });
