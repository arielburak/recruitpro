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
import { getStripeClient, createBillingPortalSession } from "@/lib/stripe";
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
    // Opcional: cuando admin baja seats < active users, lista de
    // userIds que mantienen acceso. El admin actual siempre keep (slot
    // implícito). Mismo patrón que /api/admin/billing/checkout.
    const keepUserIds: string[] = Array.isArray(body?.keepUserIds)
      ? body.keepUserIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

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
        cancelAtPeriodEnd: true,
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

    // Si el admin pide menos seats que active users, le pedimos que
    // explícitamente elija quién mantiene acceso (keepUserIds). Los
    // que NO están en la lista (y NO son el admin actual) se
    // desactivan. Mismo patrón que el subscribe-options-dialog —
    // evita el dead-end UX del "deactivate from Team first". Fix
    // 2026-06-25 con Nicolás.
    const activeUsersAll = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true },
    });
    const activeUsersCount = activeUsersAll.length;
    let toDeactivate: string[] = [];

    if (requestedSeats < activeUsersCount) {
      const adminSlot = 1; // el admin actual SIEMPRE keep
      const expectedKeepCount = requestedSeats - adminSlot;
      if (expectedKeepCount < 0) {
        return NextResponse.json(
          { error: "Cannot reduce seats below 1 (your own seat)." },
          { status: 400 },
        );
      }
      if (keepUserIds.length !== expectedKeepCount) {
        return NextResponse.json(
          {
            error: `Select exactly ${expectedKeepCount} teammate${expectedKeepCount === 1 ? "" : "s"} to keep before reducing seats.`,
            code: "missing_keep_user_ids",
            expectedKeepCount,
            activeUsers: activeUsersCount,
          },
          { status: 400 },
        );
      }

      // Validar que todos los keepUserIds pertenezcan al org + estén
      // activos + no sean el admin actual. Sino son ids spoofed.
      const validKeepIds = new Set(
        activeUsersAll
          .map((u) => u.id)
          .filter((id) => id !== ctx.userId),
      );
      for (const id of keepUserIds) {
        if (!validKeepIds.has(id)) {
          return NextResponse.json(
            { error: "Invalid teammate selection. Please retry." },
            { status: 400 },
          );
        }
      }

      const keepSet = new Set([...keepUserIds, ctx.userId]);
      toDeactivate = activeUsersAll
        .map((u) => u.id)
        .filter((id) => !keepSet.has(id));
    }

    // Si NO hay Stripe sub (trial sin tarjeta): solo update DB +
    // deactivate los users que el admin no eligió mantener (si aplica).
    // Cuando el admin haga checkout, la cantidad correcta se pasa a
    // Stripe con el count nuevo.
    if (!subscription.stripeSubscriptionId) {
      await prisma.$transaction([
        prisma.subscription.update({
          where: { organizationId: ctx.organizationId },
          data: { seats: requestedSeats },
        }),
        ...(toDeactivate.length > 0
          ? [
              prisma.user.updateMany({
                where: { id: { in: toDeactivate } },
                data: { isActive: false },
              }),
            ]
          : []),
      ]);
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

    // Cancel scheduled: comprar seats sobre una sub que va a cancelar
    // termina con seats inflados que nunca se cobran (no hay próxima
    // factura), y al final del período TODOS pierden acceso. Audit
    // 2026-06-24. El admin tiene que reactivar primero.
    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        {
          error:
            "Your subscription is set to cancel at period end. Reactivate it before adding seats.",
          code: "subscription_pending_cancellation",
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

    // Stripe OK → ahora atomic tx para DB.seats + deactivate de los
    // users que el admin no eligió mantener (si aplica). Si falla la
    // tx, Stripe ya tiene el quantity nuevo y vamos a ver drift que el
    // cron reconcile-seats corrige al día siguiente. Trade-off de MVP.
    await prisma.$transaction([
      prisma.subscription.update({
        where: { organizationId: ctx.organizationId },
        data: { seats: requestedSeats },
      }),
      ...(toDeactivate.length > 0
        ? [
            prisma.user.updateMany({
              where: { id: { in: toDeactivate } },
              data: { isActive: false },
            }),
          ]
        : []),
    ]);

    // Decisión 2026-06-22 con Nicolás: después de procesar el cambio
    // en Stripe, redirigir al Customer Portal para que el user vea el
    // cambio reflejado nativamente (invoice upcoming actualizada,
    // billing details, etc.). Como las mejores plataformas — el
    // cambio ya está hecho con el método de pago actual, pero queremos
    // que sea "siempre integrado con Stripe" visualmente.
    let portalUrl: string | null = null;
    try {
      const customerId = (
        await prisma.subscription.findUnique({
          where: { organizationId: ctx.organizationId },
          select: { stripeCustomerId: true },
        })
      )?.stripeCustomerId;
      if (customerId && !customerId.startsWith("pending_")) {
        const portalSession = await createBillingPortalSession(customerId);
        portalUrl = portalSession.url;
      }
    } catch (portalErr) {
      // Si el Portal session falla, NO bloqueamos: el cambio ya está
      // procesado en Stripe + DB. El user vuelve a la billing page y
      // ve el polling pickear el cambio. Solo logueamos para Sentry.
      console.error(
        "[update-seats] failed to create portal session:",
        portalErr,
      );
    }

    return NextResponse.json({
      seats: requestedSeats,
      synced: true,
      portalUrl,
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
