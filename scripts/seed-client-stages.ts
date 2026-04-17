import { prisma } from "../lib/prisma";

const DEFAULT_STAGES = [
  { name: "Under Review", order: 0, color: "#f59e0b", isTerminal: false, kind: null as string | null },
  { name: "Interviewing", order: 1, color: "#3b82f6", isTerminal: false, kind: null as string | null },
  { name: "Offered", order: 2, color: "#8b5cf6", isTerminal: false, kind: null as string | null },
  { name: "Placed", order: 3, color: "#10b981", isTerminal: true, kind: "positive" as string | null },
  { name: "Lost", order: 4, color: "#ef4444", isTerminal: true, kind: "negative" as string | null },
  { name: "Rejected", order: 5, color: "#6b7280", isTerminal: true, kind: "negative" as string | null },
];

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
      data: DEFAULT_STAGES.map((s) => ({
        ...s,
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
