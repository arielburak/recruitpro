import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Per-recruiter performance aggregate for the dashboard widget.
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
    prisma.candidateSubmission.findMany({
      where: {
        updatedAt: { gte: from, lte: to },
        stage: { name: "Offered" },
        candidate: { organizationId, ownerId: { in: userIds } },
      },
      select: { candidate: { select: { ownerId: true } } },
    }),
    prisma.interview.findMany({
      where: {
        organizationId,
        startTime: { gte: from, lte: to },
        candidate: { ownerId: { in: userIds } },
      },
      select: { candidate: { select: { ownerId: true } } },
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

  const placementMap = new Map<string, number>();
  for (const p of placements) {
    const id = p.recruiterId || p.submission?.candidate?.ownerId;
    if (!id) continue;
    placementMap.set(id, (placementMap.get(id) || 0) + 1);
  }

  return {
    submissions: count(submissions),
    offers: count(offers),
    interviews: count(interviews),
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
