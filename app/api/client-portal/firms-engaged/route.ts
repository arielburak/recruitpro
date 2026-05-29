import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Returns the unique list of recruiting firms (Organizations) that
// have at least one ACCEPTED engagement with this client, plus the
// per-firm collaboration aggregates:
//   - jobsCount        — distinct ClientJobs the firm is engaged on
//   - candidatesShared — CandidateSubmissions the firm shared
//   - candidatesSubmitted — total submissions (not only shared)
//   - placements       — placements closed on those Jobs
//   - pendingCount     — engagements still PENDING (response pending)
//   - lastActivityAt   — most recent submission updated-at across all
//                        the firm's Jobs for this client
//   - jobs[]           — light breakdown for drill-down on the
//                        client-portal Engagements page
export async function GET() {
  try {
    const ctx = await getClientContext();

    const engagements = await prisma.firmEngagement.findMany({
      where: { clientJob: { clientId: ctx.clientId } },
      select: {
        organizationId: true,
        clientJobId: true,
        jobId: true,
        status: true,
        invitedAt: true,
        respondedAt: true,
        organization: { select: { name: true } },
        clientJob: { select: { title: true, id: true } },
      },
    });

    // Index firm Jobs (agency-side) that contributed candidates +
    // placements to this client. We need the jobId for cross-table
    // counts; only ACCEPTED engagements have one.
    const acceptedJobIds = engagements
      .filter((e) => e.status === "ACCEPTED" && e.jobId)
      .map((e) => e.jobId as string);

    // Three engagement-level metrics tracked here, matching the
    // agency-side rollup so the same Submitted / Offers / Placements
    // labels show in both UIs:
    //   - submitted = candidates the firm pushed to this client
    //     (isSharedWithClient true).
    //   - offers   = submissions sitting in the "Offered" stage.
    //   - placements = closed deals.
    const [submittedByJob, offersByJob, placementsByJob, lastActivityByJob] =
      acceptedJobIds.length > 0
        ? await Promise.all([
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: acceptedJobIds }, isSharedWithClient: true },
              _count: { id: true },
            }),
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: acceptedJobIds }, stage: { name: "Offered" } },
              _count: { id: true },
            }),
            prisma.placement.groupBy({
              by: ["jobId"],
              where: { jobId: { in: acceptedJobIds } },
              _count: { id: true },
            }),
            prisma.candidateSubmission.groupBy({
              by: ["jobId"],
              where: { jobId: { in: acceptedJobIds } },
              _max: { updatedAt: true },
            }),
          ])
        : [[], [], [], []];

    type JobAgg = {
      clientJobId: string;
      jobId: string | null;
      title: string;
      submitted: number;
      offers: number;
      placements: number;
      lastActivityAt: string | null;
    };

    type FirmAgg = {
      organizationId: string;
      name: string;
      jobsCount: number;
      pendingCount: number;
      submitted: number;
      offers: number;
      placements: number;
      lastActivityAt: string | null;
      jobs: JobAgg[];
    };

    const byOrg = new Map<string, FirmAgg>();
    for (const e of engagements) {
      let agg = byOrg.get(e.organizationId);
      if (!agg) {
        agg = {
          organizationId: e.organizationId,
          name: e.organization.name,
          jobsCount: 0,
          pendingCount: 0,
          submitted: 0,
          offers: 0,
          placements: 0,
          lastActivityAt: null,
          jobs: [],
        };
        byOrg.set(e.organizationId, agg);
      }
      if (e.status === "PENDING") agg.pendingCount += 1;
      if (e.status === "ACCEPTED") {
        const submitted = e.jobId
          ? submittedByJob.find((r) => r.jobId === e.jobId)?._count.id || 0
          : 0;
        const offers = e.jobId
          ? offersByJob.find((r) => r.jobId === e.jobId)?._count.id || 0
          : 0;
        const placed = e.jobId
          ? placementsByJob.find((r) => r.jobId === e.jobId)?._count.id || 0
          : 0;
        const lastAt = e.jobId
          ? lastActivityByJob.find((r) => r.jobId === e.jobId)?._max.updatedAt
          : null;

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
          clientJobId: e.clientJobId,
          jobId: e.jobId,
          title: e.clientJob.title,
          submitted,
          offers,
          placements: placed,
          lastActivityAt: lastAt ? lastAt.toISOString() : null,
        });
      }
    }

    const firms = Array.from(byOrg.values())
      // Only surface firms with at least one accepted engagement —
      // pure-pending firms haven't actually started working.
      .filter((f) => f.jobsCount > 0)
      .sort(
        (a, b) =>
          b.placements - a.placements ||
          b.offers - a.offers ||
          b.submitted - a.submitted ||
          b.jobsCount - a.jobsCount ||
          a.name.localeCompare(b.name)
      );

    // Pending / declined invites mirror the agency-side Engagements
    // page so both views look symmetric — the client wants to see
    // "who haven't I heard back from?" and "who turned me down?" the
    // same way the recruiter sees their incoming invites.
    type InviteRow = {
      organizationId: string;
      organizationName: string;
      clientJobId: string;
      clientJobTitle: string;
      invitedAt: string;
      respondedAt: string | null;
    };
    const pending: InviteRow[] = [];
    const declined: InviteRow[] = [];
    for (const e of engagements) {
      if (e.status !== "PENDING" && e.status !== "DECLINED") continue;
      const row: InviteRow = {
        organizationId: e.organizationId,
        organizationName: e.organization.name,
        clientJobId: e.clientJobId,
        clientJobTitle: e.clientJob.title,
        invitedAt: e.invitedAt.toISOString(),
        respondedAt: e.respondedAt ? e.respondedAt.toISOString() : null,
      };
      if (e.status === "PENDING") pending.push(row);
      else declined.push(row);
    }

    return NextResponse.json({ firms, pending, declined });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
