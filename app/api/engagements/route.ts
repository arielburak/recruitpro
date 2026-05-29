import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { processPendingInvites } from "@/lib/process-pending-invites";

// List engagements visible to the current staffing user.
//
// Invites are STRICTLY person-level: admins do NOT see engagements they
// weren't invited to. The client on the other side chose to reach out to
// a specific person (e.g. an HM of a given area), and exposing that to
// the whole firm — even just to admins — defeats the purpose.
//
// The one exception is legacy rows that pre-date person-level invites
// (invitedUserId is null). We can't retroactively figure out who those
// were meant for, so we grandfather them as admin-visible instead of
// orphaning the data.
export async function GET() {
  try {
    const ctx = await getOrgContext();

    // Process any pending email invites for the current user
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (user) {
      await processPendingInvites(user.email, ctx.organizationId, ctx.userId).catch(() => {});
    }

    const personalClause: any = { invitedUserId: ctx.userId };
    const legacyAdminClause: any = { invitedUserId: null };

    const where: any = {
      organizationId: ctx.organizationId,
      OR: ctx.role === "ADMIN"
        ? [personalClause, legacyAdminClause]
        : [personalClause],
    };

    const engagements = await prisma.firmEngagement.findMany({
      where,
      include: {
        clientJob: {
          include: {
            client: { select: { name: true, industry: true } },
            postedBy: { select: { name: true, email: true } },
          },
        },
        invitedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { invitedAt: "desc" },
    });

    // Per-engagement collaboration stats. Only meaningful once the
    // engagement is ACCEPTED and a backing agency Job exists, since
    // candidates / placements live on the Job side. The aggregation
    // is per-engagement (i.e. per linked Job), not per-agency — that
    // higher-level rollup is the client portal's view.
    const acceptedJobIds = engagements
      .filter((e) => e.status === "ACCEPTED" && e.jobId)
      .map((e) => e.jobId as string);

    const statsByJobId = new Map<
      string,
      {
        submissions: number;
        shared: number;
        placements: number;
        lastActivityAt: string | null;
      }
    >();

    if (acceptedJobIds.length > 0) {
      const [submissionsByJob, sharedByJob, placementsByJob, lastSubByJob] =
        await Promise.all([
          prisma.candidateSubmission.groupBy({
            by: ["jobId"],
            where: { jobId: { in: acceptedJobIds } },
            _count: { id: true },
          }),
          prisma.candidateSubmission.groupBy({
            by: ["jobId"],
            where: { jobId: { in: acceptedJobIds }, isSharedWithClient: true },
            _count: { id: true },
          }),
          prisma.placement.groupBy({
            by: ["jobId"],
            where: { jobId: { in: acceptedJobIds } },
            _count: { id: true },
          }),
          // Last submission update doubles as a cheap "last activity"
          // proxy — proper activity feed would need to query
          // Comments + Activities too, but for the engagements view
          // this is enough to spot stale collaborations.
          prisma.candidateSubmission.groupBy({
            by: ["jobId"],
            where: { jobId: { in: acceptedJobIds } },
            _max: { updatedAt: true },
          }),
        ]);

      for (const jobId of acceptedJobIds) {
        const subs = submissionsByJob.find((r) => r.jobId === jobId)?._count.id || 0;
        const shared = sharedByJob.find((r) => r.jobId === jobId)?._count.id || 0;
        const placed = placementsByJob.find((r) => r.jobId === jobId)?._count.id || 0;
        const lastSub = lastSubByJob.find((r) => r.jobId === jobId)?._max.updatedAt;
        statsByJobId.set(jobId, {
          submissions: subs,
          shared,
          placements: placed,
          lastActivityAt: lastSub ? lastSub.toISOString() : null,
        });
      }
    }

    const enriched = engagements.map((e) => ({
      ...e,
      stats: e.jobId ? statsByJobId.get(e.jobId) || null : null,
    }));

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
