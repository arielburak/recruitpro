import { prisma } from "./prisma";

// Fan-out a client-portal notification when an agency-managed Job
// changes status in a way the client cares about. Right now that's:
//   - ON_HOLD  → the search is paused; the client likely wants to know
//                so they can poke their hiring committee.
//   - FILLED   → we placed the role; client should celebrate / start
//                onboarding.
// CANCELLED and LOST are intentionally NOT notified — those are
// typically initiated by the client themselves (or are internal-only
// outcomes), so a notif would be redundant.
//
// We notify every active ClientUser at the Job's Client. The
// notification link points to the agency Job through the /go bouncer
// so a multi-Client portal user gets flipped into the right context
// before the page renders.
export async function notifyClientOfJobStatusChange({
  jobId,
  newStatus,
  organizationId,
}: {
  jobId: string;
  newStatus: string;
  organizationId: string;
}) {
  if (newStatus !== "ON_HOLD" && newStatus !== "FILLED") return;

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

  const firmName = job.organization?.name || "Your recruiting firm";
  const title =
    newStatus === "ON_HOLD"
      ? `${firmName} paused the search for ${job.title}`
      : `${job.title} has been filled`;
  const body =
    newStatus === "ON_HOLD"
      ? `The search is on hold. Check in with your recruiter to find out what's next.`
      : `Congrats — ${firmName} placed a candidate in this role.`;

  await prisma.clientNotification.createMany({
    data: members.map((m) => ({
      clientId: job.clientId!,
      clientUserId: m.clientUserId,
      type: newStatus === "ON_HOLD" ? "job_on_hold" : "job_filled",
      title,
      body,
      link: `/client-portal/jobs/${clientJobId}`,
    })),
  });
}
