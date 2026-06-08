import { prisma } from "./prisma";

// Fan-out a client-portal notification when an agency-managed Job
// changes status in a way the client cares about. Right now solo:
//   - ON_HOLD  → the search is paused; the client likely wants to know
//                so they can poke their hiring committee.
//
// FILLED esta excluido a proposito: el cliente no debe enterarse por
// notif automatica cuando la agencia marca filled o registra un
// placement, porque si la agencia se equivoca (o lo marca antes de
// que el candidato firme) el aviso desaparece pero el cliente ya
// celebro. La agencia avisa manualmente cuando esta segura.
// CANCELLED y LOST tampoco se notifican — son initiated by the client
// themselves o son outcomes internos.
export async function notifyClientOfJobStatusChange({
  jobId,
  newStatus,
  organizationId,
}: {
  jobId: string;
  newStatus: string;
  organizationId: string;
}) {
  if (newStatus !== "ON_HOLD") return;

  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      title: true,
      clientId: true,
      organization: { select: { name: true } },
    },
  });
  if (!job?.clientId) return;

  // Resolve the ClientJob mirror for this agency Job. We need its
  // id to (a) limit the audience to people actually on the search
  // (WhatsApp-group rule — non-members shouldn't be notified about
  // a job they can't open), and (b) build a link that lands on
  // /client-portal/jobs/{clientJobId} directly instead of bouncing
  // through /go and risking a "Job not found".
  const engagement = await prisma.firmEngagement.findFirst({
    where: { jobId, status: "ACCEPTED" },
    select: { clientJobId: true },
  });
  if (!engagement) return;
  const clientJobId = engagement.clientJobId;

  // Audience: only ClientUsers who are members of this ClientJob.
  // A hiring manager on a different search at the same company
  // shouldn't get pinged about a role they were never invited to.
  const members = await prisma.clientJobMember.findMany({
    where: {
      clientJobId,
      clientUser: { isActive: true, clientId: job.clientId },
    },
    select: { clientUserId: true },
  });
  if (members.length === 0) return;

  // newStatus = "ON_HOLD" garantizado por el early-return de arriba.
  const firmName = job.organization?.name || "Your recruiting firm";
  await prisma.clientNotification.createMany({
    data: members.map((m) => ({
      clientId: job.clientId!,
      clientUserId: m.clientUserId,
      type: "job_on_hold",
      title: `${firmName} paused the search for ${job.title}`,
      body: `The search is on hold. Check in with your recruiter to find out what's next.`,
      link: `/client-portal/jobs/${clientJobId}`,
    })),
  });
}
