import { prisma } from "@/lib/prisma";

export class SubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionError";
  }
}

/**
 * Checks if the organization has an active subscription (ACTIVE or valid TRIALING).
 * Throws SubscriptionError if not.
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

  // PAST_DUE, CANCELED, UNPAID
  throw new SubscriptionError(
    subscription.status === "PAST_DUE"
      ? "Your payment is past due. Please update your billing information."
      : "Your subscription is inactive. Please subscribe to continue."
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
