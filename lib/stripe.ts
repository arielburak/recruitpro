import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. Add it to .env to enable billing.");
  }
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}

// Lazy-loaded to avoid crash when STRIPE_SECRET_KEY is not set
let _stripe: Stripe | null = null;
export function getStripeClient() {
  if (!_stripe) _stripe = getStripe();
  return _stripe;
}

export async function createStripeCustomer(email: string, name: string) {
  return getStripeClient().customers.create({ email, name });
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  seats: number,
  orgId: string
) {
  return getStripeClient().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: seats }],
    success_url: `${process.env.NEXTAUTH_URL}/admin/billing?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/admin/billing?canceled=true`,
    metadata: { organizationId: orgId },
    // Forzar UI en inglés. Sin esto Stripe autodetecta del browser
    // del user y puede aparecer en castellano cuando el ATS está en
    // inglés — inconsistente con el resto del flow.
    locale: "en",
  });
}

export async function createBillingPortalSession(customerId: string) {
  // ?from=portal: el componente cliente detecta el flag y dispara
  // polling para captar cambios que Stripe puede no haber propagado
  // todavía a su API en el primer fetch. Sin esto el user veía data
  // vieja por 1-5 segundos y tenía que refrescar manualmente.
  //
  // /settings/billing (no /admin/billing — esa ruta no existe).
  return getStripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXTAUTH_URL}/settings/billing?from=portal`,
    locale: "en",
  });
}

export async function updateSubscriptionSeats(
  subscriptionId: string,
  itemId: string,
  quantity: number
) {
  return getStripeClient().subscriptions.update(subscriptionId, {
    items: [{ id: itemId, quantity }],
  });
}
