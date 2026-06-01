import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// "What needs attention today" feed for the dashboard's Action Center.
// Returns counts only — drill-down endpoints fetch the actual rows
// when a tile is clicked.
//
// MVP scope: three operational signals a recruiting agency cares about
// every morning:
//   * interviewsThisWeek   — interviews scheduled Mon-Sun.
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

    // Guarantees expiring in the next 30 days — wide enough to
    // catch upcoming renewals without flooding the tile with rows.
    const guaranteeWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [interviewsThisWeek, paymentsOverdue, guaranteesExpiring] =
      await Promise.all([
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
      ]);

    return NextResponse.json({
      interviewsThisWeek,
      paymentsOverdue,
      guaranteesExpiring,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      guaranteeWindowEnd: guaranteeWindowEnd.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
