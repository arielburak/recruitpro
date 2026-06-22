// Sync de "cuántos seats está cobrando Stripe" cuando el ATS cambia
// el seat count localmente. Antes, los endpoints que agregaban/quitaban
// users solo actualizaban Subscription.seats en la DB y NUNCA le
// avisaban a Stripe → Stripe seguía cobrando el quantity original del
// checkout. Si un workspace pasaba de 1 a 5 users, Stripe seguía
// cobrando $20 en lugar de $100.
//
// Cómo funciona: cuando llamás syncStripeSeats(organizationId, newSeats):
//   1. Lee la Subscription row. Si no tiene stripeSubscriptionId
//      (todavía no se suscribió, está en trial sin tarjeta) → no-op.
//   2. Si tiene sub activa: lee el subscriptionItem.id en Stripe
//      y llama subscription.update con la nueva quantity.
//   3. Stripe automáticamente prorrata el monto en la próxima factura
//      (por default — controlado con `proration_behavior`).
//   4. Sentry/console captura errores pero NUNCA bloquea el flow del
//      caller (agregar user al ATS sigue funcionando aunque Stripe
//      falle — el sync se reintenta on the next change).

import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

// Detecta si una sub está scheduled para cancelar al fin del período.
// Stripe deprecó cancel_at_period_end (boolean) a favor de cancel_at
// (timestamp Unix o enum 'min_period_end'/'max_period_end'). Cliente
// Portal de Stripe en API 2025+ setea cancel_at, no cancel_at_period
// _end → por eso el helper viejo nunca detectaba el cancel.
// Chequeamos ambos: el legacy boolean + el nuevo cancel_at truthy.
function isStripeSubScheduledToCancel(stripeSub: any): boolean {
  if (stripeSub?.cancel_at_period_end === true) return true;
  if (stripeSub?.cancel_at) return true;
  return false;
}

// Mapea el status de Stripe a nuestro enum interno. Helper compartido
// entre el webhook handler y syncSubFromStripe para que el mapeo NO
// drift entre los 2 paths.
//
// IMPORTANTE: 'incomplete' NO se mapea — Stripe usa este estado cuando
// el primer charge falla (3DS pending, declined card, etc.) y la sub
// queda inactiva hasta que invoice.paid resuelva. Devolver undefined
// indica al caller "no toques el campo status" — la sub queda en el
// estado previo (TRIALING / pre-checkout) hasta que Stripe confirme el
// cobro. Marcar ACTIVE acá era el bug crítico del QA pre-launch:
// permitía acceder al ATS sin haber pagado durante las 23h que Stripe
// da antes de marcar incomplete_expired.
export function mapStripeStatus(
  stripeStatus: string | undefined,
): "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "TRIALING" | undefined {
  if (stripeStatus === "active") return "ACTIVE";
  if (stripeStatus === "past_due") return "PAST_DUE";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired")
    return "CANCELED";
  if (stripeStatus === "unpaid") return "UNPAID";
  if (stripeStatus === "trialing") return "TRIALING";
  // 'incomplete' y cualquier otro estado desconocido → undefined.
  // El caller debe usar spread condicional: `...(mapped && { status: mapped })`.
  return undefined;
}

// Recalcula el seat count desde scratch (count de users active) y
// sincroniza tanto la DB como Stripe. Es el helper que TODOS los
// call sites deberían usar después de cualquier cambio que afecte el
// active user count (create, delete, deactivate, reactivate, accept
// invite). Lo bueno: evita el increment/decrement manual que se
// salía de sync con la realidad (deactivar no decrementaba antes).
//
// Fire-and-forget desde los call sites — errores se logean pero no
// bloquean el flow del user.
export async function recalculateAndSyncSeats(
  organizationId: string,
): Promise<{ seats: number; stripeSynced: boolean; reason?: string }> {
  const activeUsers = await prisma.user.count({
    where: { organizationId, isActive: true },
  });
  await prisma.subscription.updateMany({
    where: { organizationId },
    data: { seats: activeUsers },
  });
  const result = await syncStripeSeats(organizationId, activeUsers);
  return {
    seats: activeUsers,
    stripeSynced: result.synced,
    reason: result.reason,
  };
}

// Sync inverso: pull desde Stripe → DB. Repara cualquier drift entre
// lo que Stripe sabe y lo que tenemos guardado (currentPeriodEnd,
// seats, cancelAtPeriodEnd, status). Idempotente: si todo coincide,
// el update es no-op. Se llama desde el endpoint GET /api/admin/
// subscription para hacer self-healing — cualquier webhook perdido
// o tardío se corrige cuando el user abre /settings/billing.
//
// No-op si:
//   · No hay row de subscription en DB
//   · isComp (no tiene Stripe sub asociada)
//   · No hay stripeSubscriptionId (TRIALING sin tarjeta)
//
// Errores de Stripe se logean y el helper devuelve {synced:false}
// — el caller debería devolver la data DB existente sin romper.
export async function syncSubFromStripe(
  organizationId: string,
): Promise<{ synced: boolean; reason?: string }> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: {
        id: true,
        stripeSubscriptionId: true,
        isComp: true,
        currentPeriodEnd: true,
        seats: true,
        cancelAtPeriodEnd: true,
        status: true,
      },
    });

    if (!subscription) return { synced: false, reason: "no_subscription_row" };
    if (subscription.isComp) return { synced: false, reason: "is_comp" };
    if (!subscription.stripeSubscriptionId) {
      return { synced: false, reason: "no_stripe_subscription_yet" };
    }

    const stripe = getStripeClient();
    const stripeSub = (await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    )) as any;

    // Stripe API 2025-09+ movió current_period_end del root del
    // Subscription a items.data[i].current_period_end. Buscamos
    // en items primero (la nueva ubicación), fallback al root para
    // cuentas con versión anterior.
    const firstItem = stripeSub.items?.data?.[0];
    const periodEndTs =
      firstItem?.current_period_end || stripeSub.current_period_end;
    const periodEnd = periodEndTs ? new Date(periodEndTs * 1000) : null;
    const quantity = firstItem?.quantity || 1;
    const willCancel = isStripeSubScheduledToCancel(stripeSub);
    const mappedStatus = mapStripeStatus(stripeSub.status as string | undefined);

    // Detectar si hace falta actualizar. Si todo coincide, skip el
    // write (idempotente, evita updatedAt churn).
    const sameStatus = !mappedStatus || subscription.status === mappedStatus;
    const sameSeats = subscription.seats === quantity;
    const sameCancel = subscription.cancelAtPeriodEnd === willCancel;
    const samePeriodEnd =
      (subscription.currentPeriodEnd?.getTime() ?? null) ===
      (periodEnd?.getTime() ?? null);

    if (sameStatus && sameSeats && sameCancel && samePeriodEnd) {
      return { synced: false, reason: "already_in_sync" };
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        seats: quantity,
        cancelAtPeriodEnd: willCancel,
        ...(periodEnd && { currentPeriodEnd: periodEnd }),
        ...(mappedStatus && { status: mappedStatus }),
      },
    });

    return { synced: true };
  } catch (error: any) {
    console.error(
      `[syncSubFromStripe] failed for org ${organizationId}:`,
      error?.message || error,
    );
    Sentry.captureException(error, {
      tags: { area: "stripe-sync", phase: "syncSubFromStripe" },
      extra: { organizationId },
    });
    return { synced: false, reason: "stripe_api_error" };
  }
}

export async function syncStripeSeats(
  organizationId: string,
  newSeats: number,
): Promise<{ synced: boolean; reason?: string }> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: { stripeSubscriptionId: true, isComp: true, status: true },
    });

    // Edge cases donde NO hay nada para sincronizar:
    if (!subscription) return { synced: false, reason: "no_subscription_row" };
    if (subscription.isComp) return { synced: false, reason: "is_comp" };
    if (!subscription.stripeSubscriptionId) {
      return { synced: false, reason: "no_stripe_subscription_yet" };
    }
    if (subscription.status === "CANCELED") {
      return { synced: false, reason: "subscription_canceled" };
    }

    // Stripe necesita el subscriptionItem.id (no el subscription.id) para
    // actualizar quantity. Lo leemos del subscription actual.
    const stripe = getStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    const item = stripeSub.items.data[0];
    if (!item) {
      return { synced: false, reason: "no_subscription_item" };
    }

    // No-op si ya está sincronizado (evita prorate calls innecesarios).
    if (item.quantity === newSeats) {
      return { synced: false, reason: "already_synced" };
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: newSeats }],
      // proration_behavior: 'none' — los cambios de seats se aplican
      // al próximo billing cycle SIN generar proration line items
      // intermedios. Decisión 2026-06-22 con Nicolás: visualmente
      // limpio (la próxima factura es el monto exacto del current
      // quantity, sin acumulación de líneas que se cancelan entre
      // sí). Patrón que usan Linear / Vercel / Notion para seat
      // changes en MVP. Trade-off menor: cliente no paga lo
      // proporcional del cambio mid-cycle — se aplica al próximo
      // ciclo completo. Para 1-5 seats con pocos cambios al mes,
      // es la UX correcta.
      proration_behavior: "none",
    });

    return { synced: true };
  } catch (error: any) {
    console.error(
      `[syncStripeSeats] failed for org ${organizationId} → ${newSeats} seats:`,
      error?.message || error,
    );
    Sentry.captureException(error, {
      tags: { area: "stripe-sync", phase: "syncStripeSeats" },
      extra: { organizationId, newSeats },
    });
    return { synced: false, reason: "stripe_api_error" };
  }
}
