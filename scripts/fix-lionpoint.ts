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
  // 1. Find Nick's client (the one he's a user of)
  const nick = await prisma.clientUser.findFirst({
    where: { email: "nick@lionpointpartners.com", isActive: true },
    include: { client: true },
  });
  if (!nick) {
    console.log("Nick not found");
    return;
  }
  console.log(`Nick's client: "${nick.client.name}" (${nick.clientId})`);

  // 2. Find Thomas Barker's submission for Legal Search Associate
  const sub = await prisma.candidateSubmission.findFirst({
    where: {
      job: { title: { contains: "Legal Search", mode: "insensitive" } },
      candidate: { firstName: { contains: "Thomas", mode: "insensitive" } },
    },
    include: { job: { include: { client: true } } },
  });
  if (!sub) {
    console.log("Submission not found");
    return;
  }
  console.log(`Submission is for job's client: "${sub.job.client.name}" (${sub.job.clientId})`);

  // 3. If they don't match, move the job to Nick's client
  if (sub.job.clientId !== nick.clientId) {
    console.log("\n⚠️  Mismatch detected — moving the Job to Nick's client...");
    await prisma.job.update({
      where: { id: sub.jobId },
      data: { clientId: nick.clientId },
    });
    console.log(`✓ Job "${sub.job.title}" reassigned to client "${nick.client.name}" (${nick.clientId})`);
  }

  // 4. Seed stages on ALL clients that don't have any
  const allClients = await prisma.client.findMany({
    select: { id: true, name: true, _count: { select: { pipelineStages: true } } },
  });
  console.log(`\nSeeding missing stages...`);
  for (const c of allClients) {
    if (c._count.pipelineStages === 0) {
      await prisma.clientPipelineStage.createMany({
        data: DEFAULT_STAGES.map((s) => ({ ...s, clientId: c.id })),
      });
      console.log(`✓ Seeded ${DEFAULT_STAGES.length} stages for "${c.name}" (${c.id})`);
    }
  }

  // 5. Backfill clientStageId for all shared submissions without one
  console.log(`\nBackfilling clientStageId...`);
  const shared = await prisma.candidateSubmission.findMany({
    where: { isSharedWithClient: true, clientStageId: null },
    select: { id: true, job: { select: { clientId: true } }, candidate: { select: { firstName: true, lastName: true } } },
  });
  for (const s of shared) {
    if (!s.job.clientId) continue;
    const first = await prisma.clientPipelineStage.findFirst({
      where: { clientId: s.job.clientId },
      orderBy: { order: "asc" },
    });
    if (first) {
      await prisma.candidateSubmission.update({
        where: { id: s.id },
        data: { clientStageId: first.id, sharedAt: new Date() },
      });
      console.log(`✓ ${s.candidate.firstName} ${s.candidate.lastName} → ${first.name}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
