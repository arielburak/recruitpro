import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { recalculateAndSyncSeats } from "@/lib/sync-stripe-seats";

// Drift detection diario: scan todas las orgs ACTIVE/TRIALING (con
// stripeSubscriptionId) y verifica que Stripe.quantity === active
// users. Si difiere, dispara recalculateAndSyncSeats — que cuenta DB,
// actualiza Subscription.seats y push a Stripe.
//
// Por qué este cron a pesar de tener auto-sync en cada mutation:
//   · Robustez. Si un webhook se pierde, un lambda muere mid-flight,
//     o Vercel mata el background promise antes de que termine
//     syncStripeSeats, el drift queda hasta el próximo cron.
//   · COMP / outliers — orgs que cambiaron entre ACTIVE/TRIALING/etc.
//   · Self-healing post-deploy: si tocamos el flow de seats sin querer,
//     el cron detecta y corrige.
//
// Idempotente: si todo coincide, no hace nada.
// Auth: Bearer ${CRON_SECRET} — mismo patrón que /cron/expire-trials.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const start = Date.now();

    // Solo orgs con sub activa o trial-con-card. CANCELED/COMP/
    // sin-sub no aplican (no hay Stripe quantity que reconciliar).
    const subs = await prisma.subscription.findMany({
      where: {
        stripeSubscriptionId: { not: null },
        isComp: false,
        status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
      },
      select: { organizationId: true, seats: true, status: true },
    });

    let checked = 0;
    let drifted = 0;
    let fixed = 0;
    const errors: Array<{ organizationId: string; reason: string }> = [];

    for (const sub of subs) {
      checked++;
      const activeUsers = await prisma.user.count({
        where: { organizationId: sub.organizationId, isActive: true },
      });
      if (activeUsers === sub.seats) continue;

      // Drift detectado. Loguear y empujar a Stripe.
      drifted++;
      Sentry.captureMessage(
        "seat drift detected by reconcile cron",
        {
          level: "warning",
          tags: { area: "cron", job: "reconcile-seats" },
          extra: {
            organizationId: sub.organizationId,
            dbSeats: sub.seats,
            activeUsers,
            status: sub.status,
          },
        },
      );

      try {
        const result = await recalculateAndSyncSeats(sub.organizationId);
        if (result.stripeSynced) {
          fixed++;
        } else {
          errors.push({
            organizationId: sub.organizationId,
            reason: result.reason || "unknown",
          });
        }
      } catch (e: any) {
        errors.push({
          organizationId: sub.organizationId,
          reason: e?.message || "exception",
        });
      }
    }

    return NextResponse.json({
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      checked,
      drifted,
      fixed,
      errors,
    });
  } catch (error: any) {
    console.error("[cron reconcile-seats] failed:", error);
    Sentry.captureException(error, {
      tags: { area: "cron", job: "reconcile-seats" },
    });
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
