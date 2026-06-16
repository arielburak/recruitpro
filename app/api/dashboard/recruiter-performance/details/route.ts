import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Per-recruiter drill-down for the Recruiter Performance widget.
//
// When the operator clicks on a number cell (e.g. Nicolas · 3
// placements), the widget calls here to fetch the underlying rows
// that make up that count. Same attribution policy as the
// aggregate endpoint so the breakdown sums to the headline number.
//
// Query params:
//   metric       "submissions" | "interviews" | "offers" | "placements"
//   recruiterId  the User id to scope the list to. Required.
//   from, to     ISO datetime range (inclusive).
//
// Returns:
//   { metric, recruiterId, items: Array<...> }
// Item shape varies per metric (see the union below).

type MetricKind = "submissions" | "interviews" | "offers" | "placements";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const sp = request.nextUrl.searchParams;

    const metric = sp.get("metric") as MetricKind | null;
    const recruiterId = sp.get("recruiterId");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");

    if (!metric || !recruiterId) {
      return NextResponse.json(
        { error: "metric + recruiterId are required" },
        { status: 400 },
      );
    }
    // Re-bind to a non-nullable local so the narrowing survives into
    // the helper closure below — TS doesn't always carry control-flow
    // narrowing across an `async function` declaration boundary.
    const userId: string = recruiterId;

    const now = new Date();
    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : now;

    // Confirm the recruiter belongs to the caller's org so a hand-
    // crafted request can't list activity from a different firm.
    const recruiter = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, name: true, email: true },
    });
    if (!recruiter) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (metric === "submissions") {
      // Submissions list = the share-with-client events, not the raw
      // CandidateSubmission rows. Each item is a moment the recruiter
      // pushed a candidate to the client. We dedup by submissionId
      // so a re-share inside the window only shows once (newest
      // share kept since we sort desc). Legacy rows logged before
      // the metric switched sources won't carry metadata
      // submissionId — we fall back to the activity row id so they
      // still appear, just without de-dup against potential
      // re-shares of the same submission.
      const rows = await prisma.activity.findMany({
        where: {
          organizationId: ctx.organizationId,
          action: "submission.shared",
          createdAt: { gte: from, lte: to },
          candidate: { ownerId: userId },
        },
        select: {
          id: true,
          createdAt: true,
          description: true,
          metadata: true,
          candidate: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Resolve the related submission (job + stage) for each event.
      // Rows logged before this switch don't carry submissionId; for
      // those we surface what we can scrape from the description and
      // leave job/stage blank rather than hitting the DB blindly.
      const SHARE_TITLE_RX = / with (.+?)'s client$/;
      const items = await Promise.all(
        rows.map(async (a) => {
          const meta = (a.metadata as { submissionId?: string } | null) || {};
          let candidateSubmissionId: string | null = meta?.submissionId || null;
          let jobInfo: { id: string; title: string; client: { name: string } | null } | null = null;
          let stage: { name: string } | null = null;
          let isSharedWithClient = true;
          if (candidateSubmissionId) {
            const sub = await prisma.candidateSubmission.findUnique({
              where: { id: candidateSubmissionId },
              select: {
                isSharedWithClient: true,
                stage: { select: { name: true } },
                job: { select: { id: true, title: true, client: { select: { name: true } } } },
              },
            });
            // Submission might have been deleted since the share — keep
            // the row but degrade the metadata; the recruiter still
            // gets credit for the share event.
            jobInfo = sub?.job || null;
            stage = sub?.stage || null;
            // Note: we report isSharedWithClient = true because this
            // list represents share events; the current toggle state
            // is irrelevant to whether the share happened.
            isSharedWithClient = true;
          }
          // Legacy fallback: scrape the job title from the canonical
          // description shape. No clientName available without the
          // submission row.
          if (!jobInfo) {
            const m = SHARE_TITLE_RX.exec(a.description || "");
            const fallbackTitle = m?.[1] || "—";
            jobInfo = { id: "", title: fallbackTitle, client: null };
          }
          return {
            id: a.id,
            createdAt: a.createdAt,
            isSharedWithClient,
            candidate: a.candidate,
            job: jobInfo,
            stage,
            submissionId: candidateSubmissionId,
          };
        }),
      );

      // One row per submission — drop duplicate share events for the
      // same submissionId (newer kept since we sorted desc). Legacy
      // rows without submissionId stay as-is (keyed by activity id).
      const seen = new Set<string>();
      const deduped = items.filter((it) => {
        const key = it.submissionId ? `s:${it.submissionId}` : `a:${it.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return NextResponse.json({ metric, recruiter, items: deduped });
    }

    // Stage-transition drill-downs (Interviews + Offers). Both metrics
    // count distinct submissions that entered a target stage in the
    // window. Same query shape, same dedup logic — just the stage
    // name differs. Pulled into a helper so the two endpoints stay
    // in lock-step.
    async function stageTransitionItems(toStage: string) {
      const rows = await prisma.activity.findMany({
        where: {
          organizationId: ctx.organizationId,
          action: "submission.stage_changed",
          createdAt: { gte: from, lte: to },
          candidate: { ownerId: userId },
          OR: [
            { metadata: { path: ["toStage"], equals: toStage } },
            { description: { contains: `to "${toStage}" in` } },
          ],
        },
        select: {
          id: true,
          createdAt: true,
          description: true,
          metadata: true,
          candidate: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      // Normalise to a stable shape — the drill-down UI doesn't need
      // to know whether the row came from structured metadata or
      // from parsing the description. The job title is recoverable
      // either way (metadata.submissionId resolves through the
      // Submission; legacy rows have the title quoted inside the
      // description).
      const items = await Promise.all(
        rows.map(async (a) => {
          const meta = (a.metadata as { submissionId?: string } | null) || {};
          let jobTitle: string | null = null;
          let jobId: string | null = null;
          let clientName: string | null = null;
          if (meta?.submissionId) {
            const sub = await prisma.candidateSubmission.findUnique({
              where: { id: meta.submissionId },
              select: {
                id: true,
                job: { select: { id: true, title: true, client: { select: { name: true } } } },
              },
            });
            jobId = sub?.job?.id || null;
            jobTitle = sub?.job?.title || null;
            clientName = sub?.job?.client?.name || null;
          }
          // Legacy fallback: scrape `in "Job title"` from the
          // description. Only used when metadata.submissionId is
          // missing.
          if (!jobTitle) {
            const m = /in "([^"]+)"/.exec(a.description);
            jobTitle = m?.[1] || null;
          }
          return {
            id: a.id,
            enteredStageAt: a.createdAt,
            candidate: a.candidate,
            jobId,
            jobTitle,
            clientName,
            submissionId: meta?.submissionId || null,
          };
        }),
      );
      // Dedup same as the aggregate count: one row per submission.
      // A candidate bounced in/out of the stage on the same job shows
      // once, with the most recent transition kept (rows are already
      // sorted desc by createdAt). The synthetic key for legacy rows
      // combines candidate + job title so two distinct jobs for the
      // same candidate still both appear.
      const seen = new Set<string>();
      return items.filter((it) => {
        const key = it.submissionId
          ? `s:${it.submissionId}`
          : `c:${it.candidate?.id || ""}|j:${it.jobTitle || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    if (metric === "interviews") {
      const deduped = await stageTransitionItems("Interviewing");
      return NextResponse.json({ metric, recruiter, items: deduped });
    }

    if (metric === "offers") {
      const deduped = await stageTransitionItems("Offered");
      return NextResponse.json({ metric, recruiter, items: deduped });
    }

    if (metric === "placements") {
      // Same attribution rule as the aggregate: recruiter override
      // wins, candidate.owner is the fallback. We OR both predicates
      // and pull the union in a single query.
      const rows = await prisma.placement.findMany({
        where: {
          organizationId: ctx.organizationId,
          updatedAt: { gte: from, lte: to },
          OR: [
            { recruiterId: userId },
            // Fallback: no override AND candidate is owned by the
            // recruiter. The null check on recruiterId avoids double-
            // counting a placement that was explicitly attributed to
            // someone else but whose candidate is owned by this user.
            {
              recruiterId: null,
              submission: { candidate: { ownerId: userId } },
            },
          ],
        },
        select: {
          id: true,
          kind: true,
          startDate: true,
          updatedAt: true,
          feeAmount: true,
          monthlyFee: true,
          currency: true,
          submission: {
            select: {
              candidate: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          job: { select: { id: true, title: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json({ metric, recruiter, items: rows });
    }

    return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
