import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Per-recruiter performance aggregate for the dashboard widget. Same
// attribution rule across every metric: whoever owns the candidate
// gets credit. Placements honor an explicit `recruiterId` override
// (the placement form lets the closer be different from the sourcer);
// everything else stays on `candidate.ownerId` because there's no
// equivalent per-event override yet.
//
// Query params:
//   from, to — ISO datetime range (inclusive). Defaults to the last
//              30 days when omitted, so the widget always renders
//              something on first load.
//
// Returns { from, to, rows: [{ userId, name, submissions, offers,
//                              interviews, placements }] }.

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const sp = request.nextUrl.searchParams;

    const now = new Date();
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : now;

    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    const userIds = users.map((u) => u.id);

    // Submissions, offers (stage = Offered), interviews — all bucketed
    // by candidate.ownerId. We pull the raw rows and bucket in JS
    // because Prisma's groupBy can't reach across the
    // submission → candidate → ownerId join in one call.
    const [submissions, offerStages, interviews, placements, candidateSubmissionsForOffers] = await Promise.all([
      prisma.candidateSubmission.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          candidate: { organizationId: ctx.organizationId, ownerId: { in: userIds } },
        },
        select: { candidate: { select: { ownerId: true } } },
      }),
      prisma.pipelineStage.findMany({
        where: { name: "Offered" },
        select: { id: true },
      }),
      prisma.interview.findMany({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: from, lte: to },
          candidate: { ownerId: { in: userIds } },
        },
        select: { candidate: { select: { ownerId: true } } },
      }),
      // Placements: honor the explicit recruiterId override when set,
      // fall back to candidate.owner otherwise. updatedAt as the time
      // anchor — `createdAt` ignores back-dated rows the recruiter
      // logged after the fact.
      prisma.placement.findMany({
        where: {
          organizationId: ctx.organizationId,
          updatedAt: { gte: from, lte: to },
        },
        select: {
          recruiterId: true,
          submission: { select: { candidate: { select: { ownerId: true } } } },
        },
      }),
      // Offers: every submission currently sitting in (or past) the
      // "Offered" stage that was MOVED into the period. Anchored on
      // updatedAt because the stageId change touches the row.
      prisma.candidateSubmission.findMany({
        where: {
          updatedAt: { gte: from, lte: to },
          stage: { name: "Offered" },
          candidate: { organizationId: ctx.organizationId, ownerId: { in: userIds } },
        },
        select: { candidate: { select: { ownerId: true } } },
      }),
    ]);

    // Suppress unused offerStages — kept here because the offers
    // count uses a name filter inline and the legacy schema may have
    // multiple stage rows named "Offered". Future-proofing against
    // per-job rename will plug into this list.
    void offerStages;

    const submissionCount = new Map<string, number>();
    for (const s of submissions) {
      const id = s.candidate?.ownerId;
      if (!id) continue;
      submissionCount.set(id, (submissionCount.get(id) || 0) + 1);
    }

    const interviewCount = new Map<string, number>();
    for (const i of interviews) {
      const id = i.candidate?.ownerId;
      if (!id) continue;
      interviewCount.set(id, (interviewCount.get(id) || 0) + 1);
    }

    const placementCount = new Map<string, number>();
    for (const p of placements) {
      const id = p.recruiterId || p.submission?.candidate?.ownerId;
      if (!id) continue;
      placementCount.set(id, (placementCount.get(id) || 0) + 1);
    }

    const offerCount = new Map<string, number>();
    for (const s of candidateSubmissionsForOffers) {
      const id = s.candidate?.ownerId;
      if (!id) continue;
      offerCount.set(id, (offerCount.get(id) || 0) + 1);
    }

    const rows = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      submissions: submissionCount.get(u.id) || 0,
      offers: offerCount.get(u.id) || 0,
      interviews: interviewCount.get(u.id) || 0,
      placements: placementCount.get(u.id) || 0,
    }));

    // Drop fully-idle recruiters from the table — zero activity in the
    // selected period is noise. Keeps the widget compact when only one
    // or two people closed anything in the chosen range.
    const activeRows = rows.filter(
      (r) => r.submissions + r.offers + r.interviews + r.placements > 0,
    );

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      rows: activeRows.sort((a, b) => b.placements - a.placements || b.offers - a.offers || b.submissions - a.submissions),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
