import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-03-31.basil",
});

export async function createStripeCustomer(email: string, name: string) {
  return stripe.customers.create({ email, name });
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  seats: number,
  orgId: string
) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: seats }],
    success_url: `${process.env.NEXTAUTH_URL}/admin/billing?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/admin/billing?canceled=true`,
    metadata: { organizationId: orgId },
  });
}

export async function createBillingPortalSession(customerId: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXTAUTH_URL}/admin/billing`,
  });
}

export async function updateSubscriptionSeats(
  subscriptionId: string,
  itemId: string,
  quantity: number
) {
  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, quantity }],
  });
}
