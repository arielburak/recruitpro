import { prisma } from "@/lib/prisma";

// Ventana de gracia cuando Stripe no pudo cobrar la renovación. Los
// Smart Retries de Stripe resuelven la mayoría de los declines
// transitorios (banco que bloquea por fraude, tarjeta vencida) dentro
// de las 72h, y lockear al equipo entero por eso era razón de churn.
//
// El ancla es `updatedAt`, NO `currentPeriodEnd`: para una sub impaga
// Stripe deja current_period_end en el fin del período que NO se pagó,
// o sea ~un mes en el futuro. Anclar ahí daba un mes largo de acceso
// gratis en vez de 3 días — fuga de plata silenciosa. `updatedAt` es
// el momento en que el webhook la marcó PAST_DUE, que es exactamente
// cuando falló el cobro. syncSubFromStripe es idempotente (no escribe
// si nada cambió), así que no se corre solo. Audit 2026-06-26.
const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function isWithinPastDueGrace(sub: { updatedAt: Date | null }): boolean {
  if (!sub.updatedAt) return false;
  return Date.now() < sub.updatedAt.getTime() + PAST_DUE_GRACE_MS;
}

export class SubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionError";
  }
}

/**
 * Checks if the organization has an active subscription (ACTIVE, valid
 * TRIALING, or isComp=true). Throws SubscriptionError if not.
 */
export async function requireActiveSubscription(organizationId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription) {
    throw new SubscriptionError(
      "No subscription found. Please set up a subscription to continue."
    );
  }

  // Complimentary / grandfathered accounts always pass, regardless of
  // Stripe status or trial expiry. Used for founders, partners, and
  // long-running internal test accounts.
  if (subscription.isComp) {
    return subscription;
  }

  if (subscription.status === "ACTIVE") {
    return subscription;
  }

  if (subscription.status === "TRIALING") {
    if (subscription.trialEndsAt && new Date() > subscription.trialEndsAt) {
      throw new SubscriptionError(
        "Your free trial has expired. Please subscribe to continue."
      );
    }
    return subscription;
  }

  // PAST_DUE: 3-day grace window. Stripe Smart Retries cubren la
  // mayoría de declines transients (banco bloquea por fraude, expiry
  // mid-period, etc.) en 24-72h. Lockear al toque el equipo entero
  // por un bank glitch transient era razón fuerte de churn. Damos
  // grace counting desde currentPeriodEnd (el momento que Stripe
  // empezó a fallar el cobro). Audit 2026-06-24 con Nicolás.
  if (subscription.status === "PAST_DUE") {
    // En grace: dejar pasar como ACTIVE. La UI muestra banner
    // amarillo "Payment failed — update card to keep access" para
    // que el admin lo arregle sin urgencia tóxica.
    if (isWithinPastDueGrace(subscription)) return subscription;
    throw new SubscriptionError(
      "Your payment is past due. Please update your billing information.",
    );
  }

  throw new SubscriptionError(
    "Your subscription is inactive. Please subscribe to continue.",
  );
}

/**
 * Returns true if the org has an active or valid trial subscription.
 */
export async function hasActiveSubscription(organizationId: string): Promise<boolean> {
  try {
    await requireActiveSubscription(organizationId);
    return true;
  } catch {
    return false;
  }
}

// Variante no-throw del guard para usar en layouts / componentes.
// Devuelve la razón específica del bloqueo si lo hay, así el UI puede
// adaptar la copy ("Trial expired" vs "Payment past due" vs "Canceled").
export type SubscriptionStatusResult =
  | { ok: true; reason: null }
  | {
      ok: false;
      reason:
        | "no_sub"
        | "trial_expired"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "inactive";
    };

export async function getSubscriptionStatus(
  organizationId: string,
): Promise<SubscriptionStatusResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: {
      status: true,
      trialEndsAt: true,
      isComp: true,
      // updatedAt es el ancla del grace de PAST_DUE (ver
      // isWithinPastDueGrace). currentPeriodEnd ya no se usa acá.
      updatedAt: true,
    },
  });

  if (!subscription) return { ok: false, reason: "no_sub" };
  if (subscription.isComp) return { ok: true, reason: null };
  if (subscription.status === "ACTIVE") return { ok: true, reason: null };
  if (subscription.status === "TRIALING") {
    if (subscription.trialEndsAt && new Date() > subscription.trialEndsAt) {
      return { ok: false, reason: "trial_expired" };
    }
    return { ok: true, reason: null };
  }
  if (subscription.status === "PAST_DUE") {
    // Mismo helper que requireActiveSubscription — antes eran dos
    // copias de la misma cuenta y podían divergir.
    if (isWithinPastDueGrace(subscription)) return { ok: true, reason: null };
    return { ok: false, reason: "past_due" };
  }
  if (subscription.status === "CANCELED") return { ok: false, reason: "canceled" };
  if (subscription.status === "UNPAID") return { ok: false, reason: "unpaid" };
  return { ok: false, reason: "inactive" };
}
