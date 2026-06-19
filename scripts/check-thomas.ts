import { prisma } from "../lib/prisma";
(async () => {
  const subs = await prisma.candidateSubmission.findMany({
    where: { candidate: { firstName: { contains: "Thomas", mode: "insensitive" } } },
    select: {
      id: true,
      isSharedWithClient: true,
      candidate: { select: { firstName: true, lastName: true } },
      job: { select: { title: true, clientId: true, client: { select: { name: true } } } },
      stage: { select: { name: true } },
    },
  });
  console.log(JSON.stringify(subs, null, 2));
  await prisma.$disconnect();
})();
