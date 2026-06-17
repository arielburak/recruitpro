import { prisma } from "../lib/prisma";

async function main() {
  // Find Nick's ClientUser
  const nick = await prisma.clientUser.findFirst({
    where: { email: "nick@lionpointpartners.com", isActive: true },
    include: { client: true },
  });
  console.log("\n=== Nick's ClientUser ===");
  console.log(JSON.stringify(nick, null, 2));

  // Find all Lionpoint Partners clients
  const clients = await prisma.client.findMany({
    where: { name: { contains: "Lionpoint", mode: "insensitive" } },
    include: {
      _count: { select: { jobs: true, pipelineStages: true, clientUsers: true } },
      pipelineStages: { orderBy: { order: "asc" }, take: 2 },
    },
  });
  console.log("\n=== All Lionpoint clients ===");
  console.log(JSON.stringify(clients, null, 2));

  // Find all submissions for Thomas Barker with job Legal Search Associate
  const subs = await prisma.candidateSubmission.findMany({
    where: {
      job: { title: { contains: "Legal", mode: "insensitive" } },
      candidate: { firstName: { contains: "Thomas", mode: "insensitive" } },
    },
    include: {
      candidate: true,
      job: { include: { client: true } },
      clientStage: true,
      stage: true,
    },
  });
  console.log("\n=== Thomas Barker submissions for Legal jobs ===");
  console.log(
    JSON.stringify(
      subs.map((s) => ({
        id: s.id,
        candidateId: s.candidateId,
        candidateName: `${s.candidate.firstName} ${s.candidate.lastName}`,
        jobId: s.jobId,
        jobTitle: s.job.title,
        clientId: s.job.clientId,
        clientName: s.job.client.name,
        isSharedWithClient: s.isSharedWithClient,
        sharedAt: s.sharedAt,
        recruiterStage: s.stage?.name,
        clientStageId: s.clientStageId,
        clientStage: s.clientStage?.name,
      })),
      null,
      2
    )
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());
