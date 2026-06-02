import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Operations strip for /placements. Surfaces the four cash-flow /
// risk signals an agency wants in front of them when they open the
// Placements section:
//   * paymentsOverdue       — HH placements past paymentDueDate
//                             that aren't PAID yet. Tile shows count;
//                             the total $ outstanding for those rows
//                             is on the same payload so the UI can
//                             tease it as a sublabel.
//   * guaranteesExpiring    — placements with guaranteeExpiry in the
//                             next 30 days (and not already past).
//   * startingNext30Days    — Any placement (HH or OS) whose
//                             startDate or estimatedStartDate lands
//                             in the next 30 days. Surface for
//                             "who's coming in and when" — applies
//                             to both kinds: HH for proactive
//                             invoicing, OS for resource handoff.
//   * mrrAtRisk             — OS placements that ENDED in the last
//                             30 days. Sublabel carries the lost
//                             MRR sum (monthlyFee total).
//
// All four predicates also feed /api/placements/operations/details
// so the click-through lists stay in sync with the headline counts.

export async function GET() {
  try {
    const ctx = await getOrgContext();
    const now = new Date();
    const orgId = ctx.organizationId;

    const guaranteeWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const startWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const mrrLookbackStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      paymentsOverdueRows,
      guaranteesExpiring,
      startingNext30Days,
      mrrAtRiskRows,
    ] = await Promise.all([
      // We pull the rows (not just count) so the response can carry
      // a sum of feeAmount as the receivables sublabel without a
      // second round-trip.
      prisma.placement.findMany({
        where: {
          organizationId: orgId,
          kind: "HH",
          paymentDueDate: { lt: now },
          invoiceStatus: { not: "PAID" },
        },
        select: { feeAmount: true, currency: true },
      }),
      prisma.placement.count({
        where: {
          organizationId: orgId,
          guaranteeExpiry: { gte: now, lte: guaranteeWindowEnd },
        },
      }),
      prisma.placement.count({
        where: {
          organizationId: orgId,
          // Match either anchor date — startDate is the firm one,
          // estimatedStartDate is what recruiters set first when
          // the actual day isn't nailed down. We want both so a
          // freshly-closed placement without a firm start still
          // shows up.
          OR: [
            { startDate: { gte: now, lte: startWindowEnd } },
            {
              AND: [
                { startDate: null },
                { estimatedStartDate: { gte: now, lte: startWindowEnd } },
              ],
            },
          ],
        },
      }),
      prisma.placement.findMany({
        where: {
          organizationId: orgId,
          kind: "OS",
          endDate: { gte: mrrLookbackStart, lte: now },
        },
        select: { monthlyFee: true, currency: true },
      }),
    ]);

    // MVP assumption (same as the rest of /placements): every row is
    // already in USD. When multi-currency reporting comes back, sum
    // in the row's currency separately and let the client convert.
    const receivablesTotal = paymentsOverdueRows.reduce(
      (sum, p) => sum + (p.feeAmount ? Number(p.feeAmount) : 0),
      0,
    );
    const mrrLost = mrrAtRiskRows.reduce(
      (sum, p) => sum + (p.monthlyFee ? Number(p.monthlyFee) : 0),
      0,
    );

    return NextResponse.json({
      paymentsOverdue: paymentsOverdueRows.length,
      receivablesTotal,
      guaranteesExpiring,
      startingNext30Days,
      mrrAtRisk: mrrAtRiskRows.length,
      mrrLost,
      guaranteeWindowEnd: guaranteeWindowEnd.toISOString(),
      startWindowEnd: startWindowEnd.toISOString(),
      mrrLookbackStart: mrrLookbackStart.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
