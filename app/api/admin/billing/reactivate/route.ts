// Endpoint para reactivar una subscription que fue marcada para
// cancelar (cancel_at_period_end=true) pero todavía no llegó al
// fin del período. Llama a Stripe para sacarle el flag y vuelve
// a quedar en ACTIVE como antes.
//
// Si la sub ya fue CANCELED definitivamente (después del period
// end), no podemos reactivar — el cliente tiene que pasar por
// un nuevo Checkout. Devolvemos 400 en ese caso.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST() {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 },
      );
    }

    // No hay sub en Stripe → el cliente nunca pagó (TRIALING sin
    // tarjeta, o el customer todavía está en "pending_"). En ese
    // caso "reactivar" no aplica — hay que ir a Checkout.
    if (!subscription.stripeSubscriptionId) {
      return NextResponse.json(
        {
          error:
            "No active Stripe subscription to reactivate. Use Subscribe instead.",
        },
        { status: 400 },
      );
    }

    if (!subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "Subscription is not scheduled to cancel — nothing to reactivate." },
        { status: 400 },
      );
    }

    // Stripe: sacar cancel_at_period_end. El webhook updated va a
    // llegar después y actualizar nuestra DB + disparar el email
    // de reactivado.
    const stripe = getStripeClient();
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Actualización optimista de la DB para que el UI refleje el
    // estado nuevo antes de que llegue el webhook (que puede
    // tardar segundos).
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}
