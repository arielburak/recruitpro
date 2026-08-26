import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";
import { safeErrorMessage } from "@/lib/safe-error";

// GET /api/admin/billing/payment-method
//
// Devuelve la card que va a usar Stripe si el admin confirma una
// nueva sub. Pensado para el SubscribeOptionsDialog (Linkedin-style
// review: el admin ve qué tarjeta se va a cobrar ANTES del redirect).
//
// Precedencia:
//   1. customer.invoice_settings.default_payment_method (customer-level)
//   2. primer PM tipo "card" listado en el customer
//   3. null → dialog muestra "you'll add a card in the next step"
//
// Si el customer es `pending_*` (signup sin checkout todavía) devolver
// null directo — no llamamos a Stripe.

export const dynamic = "force-dynamic";

type CardInfo = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null;

export async function GET() {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { stripeCustomerId: true },
    });

    if (
      !subscription?.stripeCustomerId ||
      subscription.stripeCustomerId.startsWith("pending_")
    ) {
      return NextResponse.json({ card: null as CardInfo });
    }

    const stripe = getStripeClient();
    let card: CardInfo = null;

    try {
      const customer = await stripe.customers.retrieve(
        subscription.stripeCustomerId,
        { expand: ["invoice_settings.default_payment_method"] },
      );

      if (!customer.deleted) {
        const defaultPm = customer.invoice_settings?.default_payment_method;
        if (
          defaultPm &&
          typeof defaultPm !== "string" &&
          defaultPm.type === "card" &&
          defaultPm.card
        ) {
          card = {
            brand: defaultPm.card.brand,
            last4: defaultPm.card.last4,
            expMonth: defaultPm.card.exp_month,
            expYear: defaultPm.card.exp_year,
          };
        }
      }

      // Fallback: no hay default PM seteado, pero el customer puede
      // tener una card attached (e.g. desde un Checkout previo que no
      // promovió el PM a default). Listamos y agarramos la primera.
      if (!card) {
        const list = await stripe.paymentMethods.list({
          customer: subscription.stripeCustomerId,
          type: "card",
          limit: 1,
        });
        const pm = list.data[0];
        if (pm?.card) {
          card = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          };
        }
      }
    } catch (err) {
      // Stripe falló — no rompemos la UI, devolvemos null y el dialog
      // muestra la rama "no card on file" (que es lo que va a pasar
      // de todas formas si entran a Stripe Checkout sin card).
      console.error("[payment-method] Stripe lookup failed:", err);
    }

    return NextResponse.json(
      { card },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}
