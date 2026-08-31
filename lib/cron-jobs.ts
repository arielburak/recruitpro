import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { syncStripeSeats, syncSubFromStripe } from "@/lib/sync-stripe-seats";

// Lógica de los jobs diarios, extraída de los route handlers.
//
// Por qué existe este módulo: Vercel Hobby limita la cantidad de cron
// jobs (y los fuerza a frecuencia diaria). Teníamos 3 declarados en
// vercel.json, así que al menos uno no se estaba ejecutando nunca —
// y si el que caía era expire-trials, los trials vencidos seguían
// dando acceso gratis para siempre.
//
// La solución es un único cron (/api/cron/daily) que corre los tres
// en secuencia. Para no duplicar código, la lógica vive acá y tanto
// el dispatcher como los endpoints individuales la importan. Los
// endpoints individuales se mantienen para poder disparar un job
// suelto a mano cuando hace falta debuggear.
//
// Cada job atrapa sus propias excepciones y devuelve un resultado en
// vez de tirar: en el dispatcher, que falle uno no puede impedir que
// corran los demás.

export type JobResult = {
  job: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  [key: string]: unknown;
};

// Auth compartida de todos los endpoints de cron. Vercel Cron manda
// "Authorization: Bearer ${CRON_SECRET}" automáticamente.
//
// Fail-closed a propósito: sin CRON_SECRET seteada, `expected` queda
// null y no hay header que matchee, así que responde 401. Preferimos
// que el job no corra a que quede un endpoint abierto que cualquiera
// puede hammerear.
export function isAuthorizedCron(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

async function runJob(
  job: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<JobResult> {
  const start = Date.now();
  try {
    const data = await fn();
    return { job, ok: true, durationMs: Date.now() - start, ...data };
  } catch (error: any) {
    console.error(`[cron ${job}] failed:`, error);
    Sentry.captureException(error, { tags: { area: "cron", job } });
    return {
      job,
      ok: false,
      durationMs: Date.now() - start,
      error: error?.message || "exception",
    };
  }
}

// Trials vencidos sin payment method.
//
// Caso: signup → workspace TRIALING + trialEndsAt = +7d. Si no pone
// tarjeta y pasan los 7 días, no hay Stripe sub que dispare un webhook
// para transicionarlo, así que el state DB queda TRIALING para siempre.
// El guard requireActiveSubscription bloquea el acceso igual, pero el
// estado lógico se desincroniza del real.
//
// Idempotente: un segundo run el mismo día no encuentra rows (el filtro
// excluye CANCELED).
export function expireTrials(): Promise<JobResult> {
  return runJob("expire-trials", async () => {
    const now = new Date();

    // No filtramos por isComp porque las cuentas comp son permanentes
    // y no deberían tener trial vencido.
    const result = await prisma.subscription.updateMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { lt: now },
        stripeSubscriptionId: null,
        isComp: false,
      },
      data: { status: "CANCELED" },
    });

    // Trials CON stripeSubscriptionId que siguen en TRIALING después
    // de trialEndsAt: el webhook de transición se perdió o llegó tarde.
    // Pulleamos el estado real de Stripe para repararlo.
    const stalePaidTrials = await prisma.subscription.findMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { lt: now },
        stripeSubscriptionId: { not: null },
        isComp: false,
      },
      select: { organizationId: true },
    });

    let resynced = 0;
    for (const sub of stalePaidTrials) {
      try {
        const r = await syncSubFromStripe(sub.organizationId);
        if (r.synced) resynced++;
      } catch (e) {
        console.error(
          "[cron expire-trials] sync failed:",
          sub.organizationId,
          e,
        );
      }
    }

    return { bumped: result.count, resynced, checked: stalePaidTrials.length };
  });
}

// Log de eventos de Stripe usado para idempotency.
//
// Stripe reintenta delivery por 3 días si no recibe 2xx, así que
// cualquier row más viejo que eso ya no sirve para dedup. Mantenemos
// 14 días de buffer por si hay ventanas raras de retención.
const WEBHOOK_RETENTION_DAYS = 14;

export function cleanupWebhookEvents(): Promise<JobResult> {
  return runJob("cleanup-webhook-events", async () => {
    const cutoff = new Date(
      Date.now() - WEBHOOK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await prisma.webhookEvent.deleteMany({
      where: { processedAt: { lt: cutoff } },
    });
    return { deleted: result.count, cutoff: cutoff.toISOString() };
  });
}

// Drift detection: Stripe.quantity vs Subscription.seats.
//
// Modelo Purchased: Stripe cobra el "Purchased" que el admin compró
// explícitamente. Assigned (= usuarios activos) puede ser menor y eso
// es válido — la diferencia son seats disponibles sin asignar. El cron
// solo asegura que Stripe coincida con el Purchased de la DB.
export function reconcileSeats(): Promise<JobResult> {
  return runJob("reconcile-seats", async () => {
    // CANCELED / COMP / sin-sub no aplican: no hay quantity que reconciliar.
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

      drifted++;
      Sentry.captureMessage("seat drift detected by reconcile cron", {
        level: "warning",
        tags: { area: "cron", job: "reconcile-seats" },
        extra: {
          organizationId: sub.organizationId,
          dbSeats: sub.seats,
          stripeQuantity,
          status: sub.status,
        },
      });

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

    return { checked, drifted, fixed, errors };
  });
}
