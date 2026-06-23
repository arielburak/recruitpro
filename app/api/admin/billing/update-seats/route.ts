// Endpoint para que el ADMIN compre/venda seats explícitamente desde
// el ATS (UI propia, no Stripe Portal). Pool model: el admin decide
// cuántos seats comprar, después los asigna invitando members. El
// billing se calcula sobre los seats COMPRADOS, no sobre active users
// count. Decisión 2026-06-22 con Nicolás (Figma / HubSpot / Slack
// Enterprise model).
//
// Flow:
//   1. ADMIN clickea "Manage seats" en /settings/billing
//   2. Dialog muestra current seats + breakdown $
//   3. Slider/input para nuevo N
//   4. Confirm → POST /api/admin/billing/update-seats { seats: N }
//   5. Este endpoint:
//      a. Valida que N sea razonable (>= active users count, > 0,
//         < 100 sanity cap)
//      b. Llama Stripe API para update quantity
//      c. Actualiza DB.seats = N
//   6. UI refresca con polling (mismo pattern del Portal flow)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";
import { safeErrorMessage } from "@/lib/safe-error";
import * as Sentry from "@sentry/nextjs";

const SEAT_HARD_CAP = 100;

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();

    // Solo ADMIN. USER no puede cambiar el billing.
    if (ctx.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only workspace admins can manage seats." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestedSeats = Number(body?.seats);

    // Validations sanity
    if (!Number.isFinite(requestedSeats) || requestedSeats < 1) {
      return NextResponse.json(
        { error: "Seats must be at least 1." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(requestedSeats)) {
      return NextResponse.json(
        { error: "Seats must be a whole number." },
        { status: 400 },
      );
    }
    if (requestedSeats > SEAT_HARD_CAP) {
      return NextResponse.json(
        {
          error: `Seats above ${SEAT_HARD_CAP} require manual setup. Reach out to contact@alphabridgepartners.com.`,
        },
        { status: 400 },
      );
    }

    // Subscription state actual.
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: {
        seats: true,
        stripeSubscriptionId: true,
        isComp: true,
        status: true,
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription found for this workspace." },
        { status: 404 },
      );
    }

    if (subscription.isComp) {
      return NextResponse.json(
        { error: "Complimentary accounts don't manage seats manually." },
        { status: 400 },
      );
    }

    // No-op: ya está en N. Devolvemos OK para evitar Stripe call.
    if (subscription.seats === requestedSeats) {
      return NextResponse.json({
        seats: subscription.seats,
        synced: false,
        reason: "already_at_target",
      });
    }

    // Cap inferior: no se pueden tener menos seats que active users.
    // Sino algunos users quedarían sin seat asignado (modelo de pool
    // se rompe). Si el admin quiere bajar más, primero tiene que
    // deactivar users en /settings/team.
    const activeUsersCount = await prisma.user.count({
      where: { organizationId: ctx.organizationId, isActive: true },
    });

    if (requestedSeats < activeUsersCount) {
      return NextResponse.json(
        {
          error: `You have ${activeUsersCount} active teammates. Deactivate ${
            activeUsersCount - requestedSeats
          } from Team settings before reducing seats below ${activeUsersCount}.`,
          activeUsers: activeUsersCount,
        },
        { status: 400 },
      );
    }

    // Si NO hay Stripe sub (trial sin tarjeta): solo update DB. Cuando
    // el admin haga checkout, la cantidad correcta se passes a Stripe.
    if (!subscription.stripeSubscriptionId) {
      await prisma.subscription.update({
        where: { organizationId: ctx.organizationId },
        data: { seats: requestedSeats },
      });
      return NextResponse.json({
        seats: requestedSeats,
        synced: false,
        reason: "no_stripe_sub_yet",
      });
    }

    // CANCELED: no permitimos comprar seats sobre una sub muerta. El
    // admin debe resubscribirse primero.
    if (subscription.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Subscription is canceled. Resubscribe before purchasing more seats.",
        },
        { status: 400 },
      );
    }

    // Stripe call: update quantity en el subscriptionItem.
    const stripe = getStripeClient();
    const stripeSub = (await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    )) as any;
    const item = stripeSub.items?.data?.[0];
    if (!item) {
      return NextResponse.json(
        { error: "Stripe subscription has no item. Contact support." },
        { status: 500 },
      );
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: requestedSeats }],
      // proration_behavior=none — consistente con syncStripeSeats.
      // Cambios visibles en la próxima factura completa, sin spam de
      // line items intermedios.
      proration_behavior: "none",
    });

    // Update DB optimisticamente. El webhook subscription.updated va
    // a llegar después y reconcilia (no-op si ya match).
    await prisma.subscription.update({
      where: { organizationId: ctx.organizationId },
      data: { seats: requestedSeats },
    });

    return NextResponse.json({
      seats: requestedSeats,
      synced: true,
    });
  } catch (error: any) {
    Sentry.captureException(error, {
      tags: { area: "billing", endpoint: "update-seats" },
    });
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}
