import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Drill-down rows for the /placements operations strip. Mirrors the
// predicates in /api/placements/operations exactly so the lists
// reconcile with the tile counts.

type Tile =
  | "paymentsOverdue"
  | "guaranteesExpiring"
  | "startingNext30Days"
  | "mrrAtRisk";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const sp = request.nextUrl.searchParams;
    const tile = sp.get("tile") as Tile | null;
    if (!tile) {
      return NextResponse.json({ error: "tile required" }, { status: 400 });
    }

    const now = new Date();
    const orgId = ctx.organizationId;

    const baseSelect = {
      id: true,
      kind: true,
      startDate: true,
      estimatedStartDate: true,
      paymentDueDate: true,
      guaranteeExpiry: true,
      endDate: true,
      invoiceStatus: true,
      feeAmount: true,
      monthlyFee: true,
      currency: true,
      submission: {
        select: {
          candidate: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
      job: { select: { id: true, title: true } },
      client: { select: { id: true, name: true } },
    } as const;

    if (tile === "paymentsOverdue") {
      const items = await prisma.placement.findMany({
        where: {
          organizationId: orgId,
          kind: "HH",
          paymentDueDate: { lt: now },
          invoiceStatus: { not: "PAID" },
        },
        select: baseSelect,
        orderBy: { paymentDueDate: "asc" },
      });
      return NextResponse.json({ tile, items });
    }

    if (tile === "guaranteesExpiring") {
      const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const items = await prisma.placement.findMany({
        where: {
          organizationId: orgId,
          guaranteeExpiry: { gte: now, lte: windowEnd },
        },
        select: baseSelect,
        orderBy: { guaranteeExpiry: "asc" },
      });
      return NextResponse.json({ tile, items });
    }

    if (tile === "startingNext30Days") {
      const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      // Any placement (HH or OS) whose firm OR estimated start lands
      // in the next 30 days. Sort goes through both fields in the
      // post-fetch pass since Prisma can't ORDER BY a COALESCE.
      const items = await prisma.placement.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { startDate: { gte: now, lte: windowEnd } },
            {
              AND: [
                { startDate: null },
                { estimatedStartDate: { gte: now, lte: windowEnd } },
              ],
            },
          ],
        },
        select: baseSelect,
      });
      items.sort((a, b) => {
        const ad = (a.startDate ?? a.estimatedStartDate)?.getTime() ?? 0;
        const bd = (b.startDate ?? b.estimatedStartDate)?.getTime() ?? 0;
        return ad - bd;
      });
      return NextResponse.json({ tile, items });
    }

    if (tile === "mrrAtRisk") {
      // OS engagements ending in the next 30 days — MRR at risk.
      // Soonest-ending first so the recruiter chases renewals in
      // order of urgency.
      const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const items = await prisma.placement.findMany({
        where: {
          organizationId: orgId,
          kind: "OS",
          endDate: { gte: now, lte: windowEnd },
        },
        select: baseSelect,
        orderBy: { endDate: "asc" },
      });
      return NextResponse.json({ tile, items });
    }

    return NextResponse.json({ error: "Unknown tile" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
