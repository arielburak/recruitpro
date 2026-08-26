// POST /api/admin/billing/cancel-subscription
//
// Cancela la sub al final del período. Stripe deja la sub ACTIVE hasta
// currentPeriodEnd, dispara customer.subscription.updated con
// cancel_at_period_end=true, después customer.subscription.deleted
// cuando llega la fecha. UI muestra "Scheduled to cancel" mientras
// tanto.
//
// Patrón copiado de ChatGPT (referencia Nicolás 2026-06-25): el admin
// confirma cancel pero entiende claramente "stays active until Jul 25"
// — sin ambigüedad ni miedo de que se apague YA.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST() {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only workspace admins can cancel the subscription." },
        { status: 403 },
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: {
        stripeSubscriptionId: true,
        status: true,
        cancelAtPeriodEnd: true,
        isComp: true,
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription found." },
        { status: 404 },
      );
    }
    if (subscription.isComp) {
      return NextResponse.json(
        { error: "Complimentary accounts can't be cancelled from here." },
        { status: 400 },
      );
    }
    if (!subscription.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active Stripe subscription to cancel." },
        { status: 400 },
      );
    }
    if (subscription.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Subscription is not in a cancellable state." },
        { status: 400 },
      );
    }
    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json({ ok: true, alreadyScheduled: true });
    }

    const stripe = getStripeClient();
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Optimistic DB update — el webhook va a llegar después y reconcilia.
    await prisma.subscription.update({
      where: { organizationId: ctx.organizationId },
      data: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}
