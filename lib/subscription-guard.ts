import { prisma } from "@/lib/prisma";

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
    const graceEnd = subscription.currentPeriodEnd
      ? new Date(
          subscription.currentPeriodEnd.getTime() + 3 * 24 * 60 * 60 * 1000,
        )
      : null;
    if (graceEnd && new Date() < graceEnd) {
      // En grace: dejar pasar como ACTIVE. La UI muestra banner
      // amarillo "Payment failed — update card to keep access" para
      // que el admin lo arregle sin urgencia tóxica.
      return subscription;
    }
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
      currentPeriodEnd: true,
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
    // 3-day grace post currentPeriodEnd.
    const graceEnd = subscription.currentPeriodEnd
      ? new Date(
          subscription.currentPeriodEnd.getTime() + 3 * 24 * 60 * 60 * 1000,
        )
      : null;
    if (graceEnd && new Date() < graceEnd) {
      return { ok: true, reason: null };
    }
    return { ok: false, reason: "past_due" };
  }
  if (subscription.status === "CANCELED") return { ok: false, reason: "canceled" };
  if (subscription.status === "UNPAID") return { ok: false, reason: "unpaid" };
  return { ok: false, reason: "inactive" };
}
