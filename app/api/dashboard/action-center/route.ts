import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// "What needs attention today" feed for the dashboard's Action Center.
// Returns counts only — drill-down endpoints fetch the actual rows
// when a tile is clicked.
//
// MVP scope: four operational signals a recruiting agency cares about
// every morning:
//   * interviewsThisWeek   — interviews scheduled Mon-Sun.
//   * staleSearches        — OPEN/ACTIVE jobs with no candidate
//                            activity in the last 14 days.
//   * paymentsOverdue      — HH placements with paymentDueDate
//                            in the past and invoiceStatus ≠ PAID.
//   * guaranteesExpiring   — placements with guaranteeExpiry in the
//                            next 30 days (and not already expired).

export async function GET() {
  try {
    const ctx = await getOrgContext();
    const now = new Date();
    const orgId = ctx.organizationId;

    // This week, Mon → Sun (working-week boundary, same as the
    // shared date-range picker). End-of-week inclusive so a Friday
    // interview still surfaces on Sunday review.
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const monOffset = (dow + 6) % 7;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - monOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // 14-day cutoff for staleness. A job is stale when nobody touched
    // a submission in two weeks — the same threshold most agencies
    // use internally for "needs a nudge" reviews.
    const staleCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Guarantees expiring in the next 30 days — wide enough to
    // catch upcoming renewals without flooding the tile with rows.
    const guaranteeWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      interviewsThisWeek,
      paymentsOverdue,
      guaranteesExpiring,
      activeJobs,
    ] = await Promise.all([
      prisma.interview.count({
        where: {
          organizationId: orgId,
          startTime: { gte: weekStart, lte: weekEnd },
          status: { in: ["SCHEDULED"] },
        },
      }),
      prisma.placement.count({
        where: {
          organizationId: orgId,
          kind: "HH",
          paymentDueDate: { lt: now },
          invoiceStatus: { not: "PAID" },
        },
      }),
      prisma.placement.count({
        where: {
          organizationId: orgId,
          guaranteeExpiry: { gte: now, lte: guaranteeWindowEnd },
        },
      }),
      // Pull active job ids so we can compute stale ones in JS — the
      // `updatedAt across submissions` predicate isn't expressible
      // directly in a Prisma where, so we count active jobs and
      // subtract the ones with recent activity.
      prisma.job.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["OPEN", "ACTIVE"] },
        },
        select: { id: true },
      }),
    ]);

    const activeJobIds = activeJobs.map((j) => j.id);
    // A job is "fresh" if any of its submissions was created or
    // moved in the cutoff window. Anything else gets the stale tag.
    const freshJobIds = activeJobIds.length === 0
      ? []
      : (
          await prisma.candidateSubmission.findMany({
            where: {
              jobId: { in: activeJobIds },
              OR: [
                { createdAt: { gte: staleCutoff } },
                { updatedAt: { gte: staleCutoff } },
              ],
            },
            distinct: ["jobId"],
            select: { jobId: true },
          })
        ).map((s) => s.jobId);

    const freshSet = new Set(freshJobIds);
    const staleSearches = activeJobIds.filter((id) => !freshSet.has(id)).length;

    return NextResponse.json({
      interviewsThisWeek,
      staleSearches,
      paymentsOverdue,
      guaranteesExpiring,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      staleCutoff: staleCutoff.toISOString(),
      guaranteeWindowEnd: guaranteeWindowEnd.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
