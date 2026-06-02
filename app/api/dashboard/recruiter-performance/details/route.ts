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

    const now = new Date();
    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : now;

    // Confirm the recruiter belongs to the caller's org so a hand-
    // crafted request can't list activity from a different firm.
    const recruiter = await prisma.user.findFirst({
      where: { id: recruiterId, organizationId: ctx.organizationId },
      select: { id: true, name: true, email: true },
    });
    if (!recruiter) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (metric === "submissions") {
      const rows = await prisma.candidateSubmission.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          candidate: { organizationId: ctx.organizationId, ownerId: recruiterId },
        },
        select: {
          id: true,
          createdAt: true,
          isSharedWithClient: true,
          candidate: { select: { id: true, firstName: true, lastName: true } },
          job: { select: { id: true, title: true, client: { select: { name: true } } } },
          stage: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ metric, recruiter, items: rows });
    }

    if (metric === "interviews") {
      const rows = await prisma.interview.findMany({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: from, lte: to },
          candidate: { ownerId: recruiterId },
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          status: true,
          type: true,
          candidate: { select: { id: true, firstName: true, lastName: true } },
          job: { select: { id: true, title: true, client: { select: { name: true } } } },
        },
        orderBy: { startTime: "desc" },
      });
      return NextResponse.json({ metric, recruiter, items: rows });
    }

    if (metric === "offers") {
      // Mirror the aggregate's semantic: every move INTO Offered in
      // the window counts, regardless of where the submission sits
      // now. Pull the matching Activity rows + their candidates;
      // legacy-compat with description-only logs is the same OR
      // we use in the count query.
      const rows = await prisma.activity.findMany({
        where: {
          organizationId: ctx.organizationId,
          action: "submission.stage_changed",
          createdAt: { gte: from, lte: to },
          candidate: { ownerId: recruiterId },
          OR: [
            { metadata: { path: ["toStage"], equals: "Offered" } },
            { description: { contains: 'to "Offered" in' } },
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
      // either way (metadata.jobId resolves through the Submission;
      // legacy rows have the title quoted inside `description`).
      const items = await Promise.all(
        rows.map(async (a) => {
          const meta = (a.metadata as any) || {};
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
            offeredAt: a.createdAt,
            candidate: a.candidate,
            jobId,
            jobTitle,
            clientName,
            submissionId: meta?.submissionId || null,
          };
        }),
      );
      // Dedup same as the aggregate count: one row per submission.
      // A candidate bounced in/out of Offered on the same job shows
      // once, with the most recent transition kept (rows are
      // already sorted desc by createdAt). The synthetic key for
      // legacy rows combines candidate + job title so two distinct
      // jobs for the same candidate still both appear.
      const seen = new Set<string>();
      const deduped = items.filter((it) => {
        const key = it.submissionId
          ? `s:${it.submissionId}`
          : `c:${it.candidate?.id || ""}|j:${it.jobTitle || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
            { recruiterId },
            // Fallback: no override AND candidate is owned by the
            // recruiter. The null check on recruiterId avoids double-
            // counting a placement that was explicitly attributed to
            // someone else but whose candidate is owned by this user.
            {
              recruiterId: null,
              submission: { candidate: { ownerId: recruiterId } },
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
