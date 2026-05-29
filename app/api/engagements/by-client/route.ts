import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Per-Client rollup of accepted engagements on the agency side.
// Mirror of /api/client-portal/firms-engaged but from the OTHER
// side of the graph — recruiters think "how is Acme as a client?"
// first and "Sales VP search" second, same way hiring managers
// think about firms.
//
// Returns an array of clients with per-client + per-job stats:
//   jobsCount, candidatesSubmitted, candidatesShared, placements,
//   lastActivityAt, plus a jobs[] array for the drill-down view.
//
// Person-level visibility rules from /api/engagements apply here too:
// the recruiter sees their own engagements; admins additionally see
// legacy (invitedUserId=null) rows. We don't expose ANOTHER user's
// engagements — even if they're with the same Client.

export async function GET() {
  try {
    const ctx = await getOrgContext();

    const personalClause: any = { invitedUserId: ctx.userId };
    const legacyAdminClause: any = { invitedUserId: null };

    const engagements = await prisma.firmEngagement.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "ACCEPTED",
        OR: ctx.role === "ADMIN"
          ? [personalClause, legacyAdminClause]
          : [personalClause],
      },
      include: {
        clientJob: {
          include: {
            client: { select: { id: true, name: true, industry: true } },
          },
        },
      },
      orderBy: { invitedAt: "desc" },
    });

    const jobIds = engagements
      .filter((e) => e.jobId)
      .map((e) => e.jobId as string);

    const [submissionsByJob, sharedByJob, placementsByJob, lastSubByJob, jobTitles] =
      jobIds.length > 0
        ? await Promise.all([
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: jobIds } },
              _count: { id: true },
            }),
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: jobIds }, isSharedWithClient: true },
              _count: { id: true },
            }),
            prisma.placement.groupBy({
              by: ["jobId"],
              where: { jobId: { in: jobIds } },
              _count: { id: true },
            }),
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: jobIds } },
              _max: { updatedAt: true },
            }),
            prisma.job.findMany({
              where: { id: { in: jobIds } },
              select: { id: true, title: true },
            }),
          ])
        : [[], [], [], [], []];

    const titleByJob = new Map<string, string>();
    for (const j of jobTitles as { id: string; title: string }[]) {
      titleByJob.set(j.id, j.title);
    }

    type JobAgg = {
      jobId: string;
      clientJobId: string;
      title: string;
      submissions: number;
      shared: number;
      placements: number;
      lastActivityAt: string | null;
    };

    type ClientAgg = {
      clientId: string;
      clientName: string;
      industry: string | null;
      jobsCount: number;
      candidatesSubmitted: number;
      candidatesShared: number;
      placements: number;
      lastActivityAt: string | null;
      jobs: JobAgg[];
    };

    const byClient = new Map<string, ClientAgg>();
    for (const e of engagements) {
      const client = e.clientJob.client;
      let agg = byClient.get(client.id);
      if (!agg) {
        agg = {
          clientId: client.id,
          clientName: client.name,
          industry: client.industry,
          jobsCount: 0,
          candidatesSubmitted: 0,
          candidatesShared: 0,
          placements: 0,
          lastActivityAt: null,
          jobs: [],
        };
        byClient.set(client.id, agg);
      }
      if (!e.jobId) continue;
      const subs = submissionsByJob.find((r) => r.jobId === e.jobId)?._count.id || 0;
      const shared = sharedByJob.find((r) => r.jobId === e.jobId)?._count.id || 0;
      const placed = placementsByJob.find((r) => r.jobId === e.jobId)?._count.id || 0;
      const lastAt = lastSubByJob.find((r) => r.jobId === e.jobId)?._max.updatedAt;

      agg.jobsCount += 1;
      agg.candidatesSubmitted += subs;
      agg.candidatesShared += shared;
      agg.placements += placed;
      if (lastAt) {
        const iso = lastAt.toISOString();
        if (!agg.lastActivityAt || iso > agg.lastActivityAt) {
          agg.lastActivityAt = iso;
        }
      }
      agg.jobs.push({
        jobId: e.jobId,
        clientJobId: e.clientJobId,
        title: titleByJob.get(e.jobId) || e.clientJob.title,
        submissions: subs,
        shared,
        placements: placed,
        lastActivityAt: lastAt ? lastAt.toISOString() : null,
      });
    }

    const clients = Array.from(byClient.values()).sort(
      (a, b) =>
        b.candidatesShared - a.candidatesShared ||
        b.jobsCount - a.jobsCount ||
        a.clientName.localeCompare(b.clientName)
    );

    return NextResponse.json({ clients });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
