import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Drill-down for the Action Center tiles. Mirrors the per-tile
// predicates in /api/dashboard/action-center so the lists sum back
// to the headline numbers — no surprise mismatches between "3
// payments overdue" and what the user sees when they click in.

type Tile = "interviews" | "paymentsOverdue" | "guaranteesExpiring";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const sp = request.nextUrl.searchParams;
    const tile = sp.get("tile") as Tile | null;
    if (!tile) return NextResponse.json({ error: "tile required" }, { status: 400 });

    const now = new Date();
    const orgId = ctx.organizationId;

    if (tile === "interviews") {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const dow = today.getDay();
      const monOffset = (dow + 6) % 7;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - monOffset);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const items = await prisma.interview.findMany({
        where: {
          organizationId: orgId,
          startTime: { gte: weekStart, lte: weekEnd },
          status: "SCHEDULED",
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          type: true,
          candidate: { select: { id: true, firstName: true, lastName: true } },
          job: { select: { id: true, title: true, client: { select: { name: true } } } },
        },
        orderBy: { startTime: "asc" },
      });
      return NextResponse.json({ tile, items });
    }

    if (tile === "paymentsOverdue") {
      const items = await prisma.placement.findMany({
        where: {
          organizationId: orgId,
          kind: "HH",
          paymentDueDate: { lt: now },
          invoiceStatus: { not: "PAID" },
        },
        select: {
          id: true,
          paymentDueDate: true,
          invoiceStatus: true,
          feeAmount: true,
          currency: true,
          submission: {
            select: {
              candidate: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          job: { select: { id: true, title: true } },
          client: { select: { name: true } },
        },
        // Oldest due-date first — chase the biggest delinquency
        // before fresh slip-ups.
        orderBy: { paymentDueDate: "asc" },
      });
      return NextResponse.json({ tile, items });
    }

    if (tile === "guaranteesExpiring") {
      const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const items = await prisma.placement.findMany({
        where: {
          organizationId: orgId,
          guaranteeExpiry: { gte: now, lte: windowEnd },
        },
        select: {
          id: true,
          guaranteeExpiry: true,
          startDate: true,
          submission: {
            select: {
              candidate: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          job: { select: { id: true, title: true } },
          client: { select: { name: true } },
        },
        // Closest-to-expiring first — those are the ones that bite
        // if the candidate walks the day after.
        orderBy: { guaranteeExpiry: "asc" },
      });
      return NextResponse.json({ tile, items });
    }

    return NextResponse.json({ error: "Unknown tile" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
