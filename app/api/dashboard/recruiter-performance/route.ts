import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Per-recruiter performance aggregate for the dashboard widget.
//
// Counting policy: every metric counts STAGE TRANSITIONS, not the
// underlying CRM entities. Submissions = entered "Submitted",
// Interviews = entered "Interviewing", Offers = entered "Offered",
// Placements = entered "Placed". This is what an operator means by
// "Karen had 4 interviews this week" — four candidates of hers
// reached the interview stage, not four calendar events were
// dispatched. Scheduling a second-round interview on someone who's
// already in Interviewing should NOT bump the counter.
//
// Attribution policy (consistent across every metric):
//   - Submissions / Offers / Interviews → `candidate.ownerId`. No
//     per-event override exists yet.
//   - Placements → `Placement.recruiterId` override; falls back to
//     `candidate.ownerId` when null. Lets a sourcer/closer hand-off
//     credit the right person.
//
// Query params:
//   from           ISO datetime — start of period (inclusive)
//   to             ISO datetime — end of period (inclusive)
//   recruiterIds   comma-separated User ids to scope the report to.
//                  Omitted → every active user in the org.
//   compare        "prior" → also return totals for the equal-length
//                  window immediately before `from`, so the widget
//                  can render delta chips.
//
// Returns:
//   {
//     from, to,
//     recruiters: [{ userId, name, email, ... }],   // filterable set
//     rows: Row[],                                  // per-recruiter
//     totals: { submissions, interviews, offers, placements },
//     prior?: { totals, periodLengthMs },           // when compare=prior
//   }

type AnyPrisma = typeof prisma;

async function bucketMetrics(
  prisma: AnyPrisma,
  organizationId: string,
  userIds: string[],
  from: Date,
  to: Date,
) {
  const [submissions, offers, interviews, placements] = await Promise.all([
    prisma.candidateSubmission.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        candidate: { organizationId, ownerId: { in: userIds } },
      },
      select: { candidate: { select: { ownerId: true } } },
    }),
    // "Offers" counts every distinct SUBMISSION that entered the
    // Offered stage in the window — not every move event. A
    // candidate that was bounced in/out of Offered on the same job
    // still counts once. We dedup by metadata.submissionId
    // post-query; legacy rows without submissionId fall back to a
    // coarser (candidateId + jobTitle-from-description) key so they
    // don't double-count either. Backward-compat with rows logged
    // before structured metadata: also match by the description's
    // canonical `to "Offered" in` substring.
    prisma.activity.findMany({
      where: {
        organizationId,
        action: "submission.stage_changed",
        createdAt: { gte: from, lte: to },
        candidate: { ownerId: { in: userIds } },
        OR: [
          { metadata: { path: ["toStage"], equals: "Offered" } },
          { description: { contains: 'to "Offered" in' } },
        ],
      },
      select: {
        candidateId: true,
        description: true,
        metadata: true,
        candidate: { select: { ownerId: true } },
      },
      // Newest first so the dedup keep-first logic gets the most
      // recent transition per submission for free.
      orderBy: { createdAt: "desc" },
    }),
    // "Interviews" counts every distinct SUBMISSION that entered the
    // Interviewing stage in the window — mirror of the Offers query
    // below. Scheduling a calendar Interview row no longer bumps
    // this counter on its own; only the kanban-stage transition
    // counts. Reason: a recruiter who books a second-round on a
    // candidate that's already in Interviewing was inflating their
    // number for the same milestone. Dedup logic (post-query)
    // matches the Offers pattern — by metadata.submissionId when
    // present, with a coarser candidate+job fallback for legacy
    // activity rows.
    prisma.activity.findMany({
      where: {
        organizationId,
        action: "submission.stage_changed",
        createdAt: { gte: from, lte: to },
        candidate: { ownerId: { in: userIds } },
        OR: [
          { metadata: { path: ["toStage"], equals: "Interviewing" } },
          { description: { contains: 'to "Interviewing" in' } },
        ],
      },
      select: {
        candidateId: true,
        description: true,
        metadata: true,
        candidate: { select: { ownerId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.placement.findMany({
      where: {
        organizationId,
        updatedAt: { gte: from, lte: to },
      },
      select: {
        recruiterId: true,
        submission: { select: { candidate: { select: { ownerId: true } } } },
      },
    }),
  ]);

  const count = (rows: { candidate: { ownerId: string | null } | null }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = r.candidate?.ownerId;
      if (!id) continue;
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  };

  // Dedup the stage-transition rows (offers + interviews) by
  // submission so a candidate moved in/out of the same stage on the
  // same job only counts once. New rows carry metadata.submissionId;
  // legacy rows fall back to a synthetic key combining candidateId +
  // the job title scraped from the description. Coarse but good
  // enough — a single candidate would need to have parallel
  // submissions on multiple jobs to collide. Same logic for both
  // metrics, factored into one helper.
  function bucketByOwnerDeduped(
    rows: Array<{
      // Activity.candidateId is nullable in the schema — it gets
      // unlinked when a candidate is hard-deleted but the activity
      // log row survives. We never read it as a non-null value here;
      // it's only used as a salt for the synthetic dedup key.
      candidateId: string | null;
      description: string | null;
      metadata: unknown;
      candidate: { ownerId: string | null } | null;
    }>,
  ) {
    const seen = new Set<string>();
    const m = new Map<string, number>();
    for (const a of rows) {
      const ownerId = a.candidate?.ownerId;
      if (!ownerId) continue;
      const meta = (a.metadata as { submissionId?: string } | null) || {};
      let key: string;
      if (meta?.submissionId) {
        key = `s:${meta.submissionId}`;
      } else {
        const jobMatch = /in "([^"]+)"/.exec(a.description || "");
        key = `c:${a.candidateId}|j:${jobMatch?.[1] || ""}`;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      m.set(ownerId, (m.get(ownerId) || 0) + 1);
    }
    return m;
  }
  const offersMap = bucketByOwnerDeduped(offers);
  const interviewsMap = bucketByOwnerDeduped(interviews);

  const placementMap = new Map<string, number>();
  for (const p of placements) {
    const id = p.recruiterId || p.submission?.candidate?.ownerId;
    if (!id) continue;
    placementMap.set(id, (placementMap.get(id) || 0) + 1);
  }

  return {
    submissions: count(submissions),
    offers: offersMap,
    interviews: interviewsMap,
    placements: placementMap,
  };
}

function totalsFromMaps(maps: {
  submissions: Map<string, number>;
  offers: Map<string, number>;
  interviews: Map<string, number>;
  placements: Map<string, number>;
}) {
  const sum = (m: Map<string, number>) =>
    Array.from(m.values()).reduce((a, b) => a + b, 0);
  return {
    submissions: sum(maps.submissions),
    interviews: sum(maps.interviews),
    offers: sum(maps.offers),
    placements: sum(maps.placements),
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const sp = request.nextUrl.searchParams;

    const now = new Date();
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const compare = sp.get("compare") === "prior";
    const recruiterIdsParam = sp.get("recruiterIds");

    const from = fromParam
      ? new Date(fromParam)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : now;

    // Roster — every active user in the org. Drives both the
    // recruiter-filter picker on the widget AND the per-row metrics
    // table below. We always return the full roster (not the
    // filtered subset) so the picker can render even when the
    // current selection is just one user.
    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    const allUserIds = users.map((u) => u.id);

    // Scope the metric queries to the filtered set when the picker
    // has narrowed it. Empty list = "no recruiters picked" → empty
    // rows.
    const filteredIds = recruiterIdsParam
      ? recruiterIdsParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => allUserIds.includes(s))
      : allUserIds;

    const maps = await bucketMetrics(
      prisma,
      ctx.organizationId,
      filteredIds,
      from,
      to,
    );
    const totals = totalsFromMaps(maps);

    // Prior-period totals for the delta-vs-previous chip. Same
    // length, anchored at `from`. Skipped when caller didn't ask
    // for it — keeps the cost of the widget proportional to the
    // user's interest in the comparison.
    let prior: { totals: typeof totals; from: string; to: string } | null = null;
    if (compare) {
      const periodMs = to.getTime() - from.getTime();
      const priorTo = new Date(from.getTime() - 1);
      const priorFrom = new Date(priorTo.getTime() - periodMs);
      const priorMaps = await bucketMetrics(
        prisma,
        ctx.organizationId,
        filteredIds,
        priorFrom,
        priorTo,
      );
      prior = {
        totals: totalsFromMaps(priorMaps),
        from: priorFrom.toISOString(),
        to: priorTo.toISOString(),
      };
    }

    const rows = filteredIds
      .map((id) => {
        const u = users.find((x) => x.id === id);
        if (!u) return null;
        const submissions = maps.submissions.get(id) || 0;
        const placements = maps.placements.get(id) || 0;
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          submissions,
          interviews: maps.interviews.get(id) || 0,
          offers: maps.offers.get(id) || 0,
          placements,
          // Conversion = closed deals / candidates put in front of
          // a client. 0 when the recruiter has no submissions
          // (avoids a NaN in the UI).
          conversionPct:
            submissions > 0
              ? Math.round((placements / submissions) * 1000) / 10
              : 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      // Hide fully-idle rows so the table stays compact on quiet
      // periods. The picker shows the full roster regardless.
      .filter((r) => r.submissions + r.offers + r.interviews + r.placements > 0)
      .sort(
        (a, b) =>
          b.placements - a.placements ||
          b.offers - a.offers ||
          b.submissions - a.submissions,
      );

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      recruiters: users,
      rows,
      totals,
      prior,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
