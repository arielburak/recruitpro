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

  const clientUsers = await prisma.clientUser.findMany({
    where: { clientId: job.clientId, isActive: true },
    select: { id: true },
  });
  if (clientUsers.length === 0) return;

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
    data: clientUsers.map((cu) => ({
      clientId: job.clientId!,
      clientUserId: cu.id,
      type: newStatus === "ON_HOLD" ? "job_on_hold" : "job_filled",
      title,
      body,
      link: `/client-portal/go?clientId=${job.clientId}&jobId=${jobId}`,
    })),
  });
}
