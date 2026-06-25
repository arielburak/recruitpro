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
  const stripe = getStripeClient();

  // En non-production atachamos un Test Clock al customer. Eso nos
  // deja "viajar en el tiempo" desde el Stripe Dashboard:
  //   Stripe Dashboard → Test data → Test clocks → Advance →
  //   eligen +8 días → Stripe dispara TODOS los webhooks que
  //   hubieran sucedido naturalmente (trial → ACTIVE, invoice.paid,
  //   etc.). Es el patrón que usan Slack/Linear/Notion para QA
  //   billing sin esperar fechas reales.
  // En production: no test clock (el customer corre en tiempo real).
  const isProduction = process.env.VERCEL_ENV === "production";
  let testClockId: string | undefined;
  if (!isProduction) {
    try {
      const clock = await stripe.testHelpers.testClocks.create({
        frozen_time: Math.floor(Date.now() / 1000),
        name: `test-clock-${email}`,
      });
      testClockId = clock.id;
      console.log(
        `[stripe] created test clock ${testClockId} for customer ${email} (non-production)`,
      );
    } catch (e) {
      // Si test_clocks falla (e.g. live mode por error, o feature
      // deshabilitada), seguimos con customer normal — no rompemos
      // el signup. El user simplemente no va a tener time-travel
      // disponible para esta cuenta.
      console.warn("[stripe] test clock creation failed (continuing):", e);
    }
  }

  return stripe.customers.create({
    email,
    name,
    ...(testClockId && { test_clock: testClockId }),
  });
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  seats: number,
  orgId: string,
  // QA HIGH (Stripe audit): si la org está en TRIALING con trialEndsAt
  // en el futuro, pasamos esa fecha a Stripe via subscription_data.
  // trial_end para que respete el trial restante. Sin esto, Stripe
  // arrancaba la sub ACTIVE inmediato y cobraba en ese momento — el
  // user perdía los días restantes de trial que el ATS le había
  // ofrecido. Pasar null/undefined = comportamiento default (cobro
  // inmediato, no trial).
  trialEnd?: Date | null,
) {
  // Stripe acepta trial_end como Unix timestamp en segundos.
  //
  // Audit 2026-06-24 HIGH: antes el guard `trialEnd > Date.now()` se
  // saltaba SILENCIOSO cuando trialEnd era past, y Stripe cobraba al
  // toque — pero el caller le había prometido al user "won't be charged
  // today". Ahora throw para que el route lo capture y devuelva 409
  // "trial expired, refresh and retry" en vez de cobrar a destiempo.
  let trialEndTs: number | null = null;
  if (trialEnd) {
    if (trialEnd.getTime() <= Date.now()) {
      const err: any = new Error("Trial has already expired — refresh and retry");
      err.code = "trial_already_expired";
      throw err;
    }
    trialEndTs = Math.floor(trialEnd.getTime() / 1000);
  }

  return getStripeClient().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: seats }],
    ...(trialEndTs && {
      subscription_data: { trial_end: trialEndTs },
    }),
    // /settings/billing (no /admin/billing — esa ruta no existe).
    // El billing page lee ?success=true / ?canceled=true para mostrar
    // los banners correspondientes.
    success_url: `${process.env.NEXTAUTH_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/settings/billing?canceled=true`,
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
