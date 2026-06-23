import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createCheckoutSession, createStripeCustomer } from "@/lib/stripe";
import { stripePriceIdForSeats, TEAM_MAX_SEATS } from "@/lib/constants";
import { safeErrorMessage } from "@/lib/safe-error";
import { recalculateAndSyncSeats } from "@/lib/sync-stripe-seats";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // Body opcional: { payNow: boolean, seats?: number }.
    // Decisión 2026-06-22 con Nicolás:
    //   · payNow=true → cobra inmediato, ACTIVE de una
    //   · payNow=false (default) → trial_end nativo Stripe, cobro al fin
    //   · seats → cantidad que el admin elige comprar. Default a
    //     subscription.seats. Si seats < activeUsers, deactivamos
    //     los más recientes (excluyendo al admin actual) antes del
    //     checkout para alinear con la quantity comprada.
    const body = await request.json().catch(() => ({}));
    const payNow = body?.payNow === true;
    const requestedSeats = Number(body?.seats);
    const hasSeatsParam = Number.isFinite(requestedSeats) && requestedSeats >= 1;

    // QA HIGH #2: recalcular seats antes del checkout para reflejar
    // active users actuales. Si el admin pasó `seats` en el body
    // (pivote 2026-06-22: elige cuánto comprar), va a override más
    // abajo. Si no pasó, este recalc deja seats = active users count.
    await recalculateAndSyncSeats(ctx.organizationId);

    // Si el admin pasó `seats` y es menor que active users, deactivar
    // los users más recientes (excluyendo al admin actual) hasta
    // alcanzar el target. Los users deactivados pueden ser
    // reactivados después comprando más seats.
    if (hasSeatsParam) {
      const activeUsersCount = await prisma.user.count({
        where: { organizationId: ctx.organizationId, isActive: true },
      });
      if (requestedSeats < activeUsersCount) {
        const toDeactivateCount = activeUsersCount - requestedSeats;
        // Más recientes primero, excluir al admin actual.
        const candidates = await prisma.user.findMany({
          where: {
            organizationId: ctx.organizationId,
            isActive: true,
            NOT: { id: ctx.userId },
          },
          orderBy: { createdAt: "desc" },
          take: toDeactivateCount,
          select: { id: true },
        });
        if (candidates.length < toDeactivateCount) {
          return NextResponse.json(
            {
              error:
                "Can't deactivate enough teammates to fit fewer seats. Try a higher seat count.",
            },
            { status: 400 },
          );
        }
        await prisma.user.updateMany({
          where: { id: { in: candidates.map((u) => u.id) } },
          data: { isActive: false },
        });
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
