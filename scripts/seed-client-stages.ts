import { prisma } from "../lib/prisma";
import { DEFAULT_STAGES } from "../lib/constants";

async function main() {
  console.log("Seeding client pipeline stages...");

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, _count: { select: { pipelineStages: true } } },
  });

  let clientsSeeded = 0;
  for (const client of clients) {
    if (client._count.pipelineStages > 0) {
      console.log(`· ${client.name}: already has ${client._count.pipelineStages} stages, skipping`);
      continue;
    }
    await prisma.clientPipelineStage.createMany({
      data: DEFAULT_STAGES.map((s, i) => ({
        name: s.name,
        order: i,
        color: s.color,
        isTerminal: s.isTerminal,
        kind: s.kind,
        clientId: client.id,
      })),
    });
    clientsSeeded++;
    console.log(`✓ ${client.name}: created ${DEFAULT_STAGES.length} default stages`);
  }

  console.log(`\nClients seeded: ${clientsSeeded}/${clients.length}`);

  // Backfill clientStageId on existing shared submissions
  console.log("\nBackfilling clientStageId on shared submissions...");
  const sharedMissing = await prisma.candidateSubmission.findMany({
    where: { isSharedWithClient: true, clientStageId: null },
    select: { id: true, job: { select: { clientId: true } } },
  });

  let backfilled = 0;
  for (const sub of sharedMissing) {
    if (!sub.job.clientId) continue;
    const firstStage = await prisma.clientPipelineStage.findFirst({
      where: { clientId: sub.job.clientId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!firstStage) continue;
    await prisma.candidateSubmission.update({
      where: { id: sub.id },
      data: { clientStageId: firstStage.id, sharedAt: new Date() },
    });
    backfilled++;
  }

  console.log(`Backfilled ${backfilled} shared submissions to first stage.`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
