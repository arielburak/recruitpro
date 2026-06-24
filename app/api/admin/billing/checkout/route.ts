import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createCheckoutSession, createStripeCustomer, getStripeClient } from "@/lib/stripe";
import { stripePriceIdForSeats, TEAM_MAX_SEATS } from "@/lib/constants";
import { safeErrorMessage } from "@/lib/safe-error";
import { recalculateAndSyncSeats } from "@/lib/sync-stripe-seats";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // Body: { payNow, seats?, keepUserIds? }.
    // Decisión 2026-06-22 con Nicolás (pivote final):
    //   · payNow=true → cobra inmediato, ACTIVE de una
    //   · payNow=false (default) → trial_end nativo Stripe
    //   · seats → cantidad que el admin elige comprar
    //   · keepUserIds → si seats < activeUsers, lista de userIds
    //     (sin contar al admin actual) que mantienen acceso. Los
    //     que NO están en la lista (y NO son el admin) se deactivan.
    const body = await request.json().catch(() => ({}));
    const payNow = body?.payNow === true;
    const requestedSeats = Number(body?.seats);
    const hasSeatsParam = Number.isFinite(requestedSeats) && requestedSeats >= 1;
    const keepUserIds: string[] = Array.isArray(body?.keepUserIds)
      ? body.keepUserIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // QA HIGH #2: recalcular seats antes del checkout para reflejar
    // active users actuales. Si el admin pasó `seats` en el body
    // (pivote 2026-06-22: elige cuánto comprar), va a override más
    // abajo. Si no pasó, este recalc deja seats = active users count.
    await recalculateAndSyncSeats(ctx.organizationId);

    // Si el admin pasó `seats` y es menor que active users, deactivar
    // los teammates que el admin NO eligió mantener (keepUserIds).
    // El admin actual nunca se deactiva (su seat es obligatorio).
    if (hasSeatsParam) {
      const activeUsersAll = await prisma.user.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        select: { id: true },
      });
      const activeUsersCount = activeUsersAll.length;

      if (requestedSeats < activeUsersCount) {
        // Validar que el admin pasó keepUserIds + tiene el count correcto.
        const adminSlot = 1; // siempre el admin actual
        const expectedKeepCount = requestedSeats - adminSlot;
        if (keepUserIds.length !== expectedKeepCount) {
          return NextResponse.json(
            {
              error: `Select exactly ${expectedKeepCount} teammate${expectedKeepCount === 1 ? "" : "s"} to keep before subscribing with fewer seats.`,
            },
            { status: 400 },
          );
        }

        // Validar que todos los keepUserIds pertenezcan al org + estén
        // activos + no sean el admin. Sino son ids spoofed.
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

        // Deactivar los que NO están en keepUserIds (y no son el admin).
        const keepSet = new Set([...keepUserIds, ctx.userId]);
        const toDeactivate = activeUsersAll
          .map((u) => u.id)
          .filter((id) => !keepSet.has(id));
        if (toDeactivate.length > 0) {
          await prisma.user.updateMany({
            where: { id: { in: toDeactivate } },
            data: { isActive: false },
          });
        }
      }

      // Update subscription.seats al target final.
      await prisma.subscription.update({
        where: { organizationId: ctx.organizationId },
        data: { seats: requestedSeats },
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      include: { organization: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    // Bloquear doble-subscribe. Si ya hay un stripeSubscriptionId
    // valido en Stripe (active / trialing / past_due), no creamos
    // otra checkout session — sino el user termina con N subs
    // paralelas cobrandole N veces. Bug reportado por Nicolas
    // 2026-06-24 (vio 2 "Active trials" en Customer Portal).
    // Allowed states para re-checkout: canceled, incomplete_expired,
    // o sub que ya no existe en Stripe (404).
    if (subscription.stripeSubscriptionId) {
      try {
        const existing = await getStripeClient().subscriptions.retrieve(
          subscription.stripeSubscriptionId,
        );
        const blocked = ["active", "trialing", "past_due", "incomplete"];
        if (blocked.includes(existing.status)) {
          return NextResponse.json(
            {
              error: "You already have an active subscription. Use Manage billing to make changes.",
              code: "subscription_already_active",
              status: existing.status,
            },
            { status: 409 },
          );
        }
      } catch (err: any) {
        // Sub borrada del lado Stripe — seguir con el flow nuevo. El
        // stripeSubscriptionId se va a sobreescribir con el de la
        // sesión nueva cuando llegue el webhook.
        if (err?.code !== "resource_missing") throw err;
      }
    }

    if (subscription.seats > TEAM_MAX_SEATS) {
      return NextResponse.json(
        { error: `Self-serve plans top out at ${TEAM_MAX_SEATS} seats — contact us for more.` },
        { status: 400 }
      );
    }

    let customerId = subscription.stripeCustomerId;

    // Create real Stripe customer if pending
    if (customerId.startsWith("pending_")) {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
      const customer = await createStripeCustomer(
        user?.email || "",
        subscription.organization.name
      );
      customerId = customer.id;
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // trial_end nativo en Stripe — solo si NO eligió payNow.
    //   · TRIALING + !payNow → respeta trial restante (no cobra hasta
    //     trialEndsAt). Sub queda con status=TRIALING hasta esa fecha.
    //   · TRIALING + payNow → cobra inmediato, pasa a ACTIVE de una
    //     (permite agregar seats / usar todas las features que requieren
    //     billing activo).
    //   · No-TRIAL → siempre cobro inmediato (no aplica).
    const trialEnd =
      !payNow &&
      subscription.status === "TRIALING" &&
      subscription.trialEndsAt
        ? subscription.trialEndsAt
        : null;

    const session = await createCheckoutSession(
      customerId,
      stripePriceIdForSeats(subscription.seats),
      subscription.seats,
      ctx.organizationId,
      trialEnd,
    );

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
