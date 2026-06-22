import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";

// Daily cron que limpia trials expirados sin payment method.
//
// Caso: user signup → workspace en TRIALING + trialEndsAt = +7d. Si
// no pone tarjeta y pasan los 7 días, el state DB queda TRIALING
// indefinidamente (no hay Stripe sub que dispare webhook para
// transicionarlo). El guard requireActiveSubscription bloquea el
// acceso correctamente, pero el state lógico se desincroniza del
// real → reports/dashboards de founders muestran TRIALING ghosts.
//
// Este endpoint corre via Vercel Cron Scheduler (configurado en
// vercel.json con "0 3 * * *" — 3 AM UTC diario). Bumps trials
// vencidos sin Stripe sub a status=CANCELED.
//
// Auth: header "Authorization: Bearer ${CRON_SECRET}" — Vercel Cron
// agrega ese header automáticamente. Sin esto, cualquiera podría
// hammerear el endpoint.
//
// Idempotente: si corre 2 veces el mismo día, el segundo run no
// encuentra rows que actualizar (el filter excluye CANCELED).

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret. En Vercel Cron, el header viene con
  // "Authorization: Bearer ${CRON_SECRET}".
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Bump expired trials (no Stripe sub, trial vencido) a CANCELED.
    // No incluimos isComp porque comp accounts no deberían tener
    // trial expirado — son permanentes.
    const result = await prisma.subscription.updateMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { lt: now },
        stripeSubscriptionId: null,
        isComp: false,
      },
      data: { status: "CANCELED" },
    });

    return NextResponse.json({
      processedAt: now.toISOString(),
      bumped: result.count,
    });
  } catch (error: any) {
    console.error("[cron expire-trials] failed:", error);
    Sentry.captureException(error, {
      tags: { area: "cron", job: "expire-trials" },
    });
    return NextResponse.json(
      { error: "Cron job failed" },
      { status: 500 },
    );
  }
}
