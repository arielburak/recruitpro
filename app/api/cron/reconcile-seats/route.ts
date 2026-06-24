import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { syncStripeSeats } from "@/lib/sync-stripe-seats";
import { getStripeClient } from "@/lib/stripe";

// Drift detection diario: scan todas las orgs con stripeSubscriptionId
// y verifica que Stripe.quantity === Subscription.seats (= Purchased).
// Si difiere, push DB→Stripe.
//
// Modelo Purchased (H5 2026-06-24): Stripe siempre cobra el "Purchased"
// que el admin compró explícitamente. Assigned (= count active users)
// puede ser menor (= hay Available en el pool) y eso es válido. El
// cron solo asegura que Stripe coincida con el Purchased almacenado
// en DB.
//
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
      select: {
        organizationId: true,
        seats: true,
        status: true,
        stripeSubscriptionId: true,
      },
    });

    let checked = 0;
    let drifted = 0;
    let fixed = 0;
    const errors: Array<{ organizationId: string; reason: string }> = [];
    const stripe = getStripeClient();

    for (const sub of subs) {
      checked++;

      // Leer Stripe quantity actual y compararla con DB.seats (Purchased).
      let stripeQuantity: number | null = null;
      try {
        const stripeSub = (await stripe.subscriptions.retrieve(
          sub.stripeSubscriptionId!,
        )) as any;
        stripeQuantity = stripeSub.items?.data?.[0]?.quantity ?? null;
      } catch (e: any) {
        errors.push({
          organizationId: sub.organizationId,
          reason: "stripe_retrieve_failed: " + (e?.message || "exception"),
        });
        continue;
      }

      if (stripeQuantity === null || stripeQuantity === sub.seats) continue;

      // Drift: DB.seats (= Purchased autoritativo) != Stripe.quantity.
      drifted++;
      Sentry.captureMessage(
        "seat drift detected by reconcile cron",
        {
          level: "warning",
          tags: { area: "cron", job: "reconcile-seats" },
          extra: {
            organizationId: sub.organizationId,
            dbSeats: sub.seats,
            stripeQuantity,
            status: sub.status,
          },
        },
      );

      try {
        const result = await syncStripeSeats(sub.organizationId, sub.seats);
        if (result.synced) {
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
