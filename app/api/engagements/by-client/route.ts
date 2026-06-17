import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

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

    // Engagement-level metrics surfaced to the recruiter, in the order
    // the deal flows from left to right:
    //   - submitted = candidates the recruiter actually pushed to the
    //     client (isSharedWithClient true). The recruiter mental model
    //     of "submitted" is what the client SAW, not the internal pool.
    //   - offers   = submissions in the "Offered" pipeline stage. The
    //     closer-to-the-money signal that recruiters track per client.
    //   - placements = closed deals.
    // The total sourced pool is intentionally not exposed here — that's
    // internal agency stuff, not engagement-level info.
    const [submittedByJob, offersByJob, placementsByJob, lastSubByJob, jobTitles] =
      jobIds.length > 0
        ? await Promise.all([
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: jobIds }, isSharedWithClient: true },
              _count: { id: true },
            }),
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: jobIds }, stage: { name: "Offered" } },
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
      submitted: number;
      offers: number;
      placements: number;
      lastActivityAt: string | null;
    };

    type ClientAgg = {
      clientId: string;
      clientName: string;
      industry: string | null;
      jobsCount: number;
      submitted: number;
      offers: number;
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
          submitted: 0,
          offers: 0,
          placements: 0,
          lastActivityAt: null,
          jobs: [],
        };
        byClient.set(client.id, agg);
      }
      if (!e.jobId) continue;
      const submitted = submittedByJob.find((r) => r.jobId === e.jobId)?._count.id || 0;
      const offers = offersByJob.find((r) => r.jobId === e.jobId)?._count.id || 0;
      const placed = placementsByJob.find((r) => r.jobId === e.jobId)?._count.id || 0;
      const lastAt = lastSubByJob.find((r) => r.jobId === e.jobId)?._max.updatedAt;

      agg.jobsCount += 1;
      agg.submitted += submitted;
      agg.offers += offers;
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
        submitted,
        offers,
        placements: placed,
        lastActivityAt: lastAt ? lastAt.toISOString() : null,
      });
    }

    const clients = Array.from(byClient.values()).sort(
      (a, b) =>
        b.placements - a.placements ||
        b.offers - a.offers ||
        b.submitted - a.submitted ||
        b.jobsCount - a.jobsCount ||
        a.clientName.localeCompare(b.clientName)
    );

    return NextResponse.json({ clients });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
