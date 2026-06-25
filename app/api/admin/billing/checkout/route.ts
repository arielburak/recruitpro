import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createCheckoutSession, createStripeCustomer, getStripeClient } from "@/lib/stripe";
import { stripePriceIdForSeats, TEAM_MAX_SEATS } from "@/lib/constants";
import { safeErrorMessage } from "@/lib/safe-error";
import { recalculateAndSyncSeats, mapStripeStatus } from "@/lib/sync-stripe-seats";

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
    // inline=true: nuevo flow Linkedin-style (2026-06-25). El admin
    // confirma en NUESTRO dialog, el backend crea la sub directo via
    // stripe.subscriptions.create usando la card guardada — sin
    // bouncear a checkout.stripe.com. Solo aplica si el customer tiene
    // un PaymentMethod attached; sino devolvemos { needsCheckout: true }
    // y el front cae al flow viejo (Stripe Checkout redirect).
    const inline = body?.inline === true;
    const requestedSeats = Number(body?.seats);
    const hasSeatsParam = Number.isFinite(requestedSeats) && requestedSeats >= 1;
    // Distinguir presencia vs ausencia: el frontend nuevo SIEMPRE manda
    // la lista (incluso si el admin no marcó a nadie = []). El frontend
    // viejo / caller programático puede no mandarla y queremos hacer
    // backward-compat (todos mantienen) en ese caso.
    const callerSentList = Array.isArray(body?.keepUserIds);
    const keepUserIds: string[] = callerSentList
      ? body.keepUserIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // QA HIGH #2: recalcular seats antes del checkout para reflejar
    // active users actuales. Si el admin pasó `seats` en el body
    // (pivote 2026-06-22: elige cuánto comprar), va a override más
    // abajo. Si no pasó, este recalc deja seats = active users count.
    await recalculateAndSyncSeats(ctx.organizationId);

    // ── Pre-validación: calcular toDeactivate ANTES de tocar nada ──
    //
    // Audit 2026-06-23: antes, el deactivate + subscription.update
    // corrían arriba en 2 writes separadas (no tx). Si createCheckout
    // Session fallaba después, los users quedaban deactivated sin
    // Stripe sub creada — el admin re-clickeaba y veía un equipo
    // gutted sin haber pagado nada.
    //
    // Nuevo orden:
    //   1. Validar inputs + computar toDeactivate (sin mutar nada).
    //   2. Crear Stripe checkout session.
    //   3. Solo si Stripe respondió OK, atomic tx con deactivate +
    //      subscription.seats update.
    //   4. Devolver URL.
    //
    // Si el server muere entre 2 y 3: la sub queda creada en Stripe
    // pero los users no quedan deactivated. El admin va a ver "X of Y
    // seats in use" con X > Y en /settings/team y va a tener que
    // re-correr el flow o sacar seats manualmente. Trade-off aceptable
    // para MVP: prefiero over-provisioned que team gutted sin pagar.
    let toDeactivate: string[] = [];
    let finalSeats: number | null = null;
    if (hasSeatsParam) {
      const activeUsersAll = await prisma.user.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        select: { id: true },
      });

      // Modelo LinkedIn explícito (2026-06-25 con Nicolás): el admin
      // SIEMPRE elige quién mantiene seat al subscribirse, incluso si
      // compra MÁS seats que los active users actuales (puede querer
      // dejar 2 Available en el pool para invitar después).
      //
      // Caller envía keepUserIds = lista de userIds que MANTIENEN seat
      // (el admin actual es slot implícito, no aparece en la lista).
      // Si keepUserIds NO vino o vino vacío y hay >1 active users,
      // asumimos backward-compat: todos los active mantienen.
      const adminSlot = 1;
      const maxKeepCount = requestedSeats - adminSlot;

      if (keepUserIds.length > maxKeepCount) {
        return NextResponse.json(
          {
            error: `You can keep at most ${maxKeepCount} teammate${maxKeepCount === 1 ? "" : "s"} with ${requestedSeats} seat${requestedSeats === 1 ? "" : "s"}.`,
          },
          { status: 400 },
        );
      }

      // Anti-spoofing: cada keepUserId debe pertenecer a un active
      // user del org Y no ser el admin actual.
      const validKeepIds = new Set(
        activeUsersAll.map((u) => u.id).filter((id) => id !== ctx.userId),
      );
      for (const id of keepUserIds) {
        if (!validKeepIds.has(id)) {
          return NextResponse.json(
            { error: "Invalid teammate selection. Please retry." },
            { status: 400 },
          );
        }
      }

      // Si el caller envió la lista (aunque sea vacía) → respetar la
      // elección explícita del admin: el admin + los marcados mantienen,
      // resto se desactiva.
      // Si NO la envió → backward-compat: todos los active actuales
      // mantienen (incluido el admin).
      const keepSet = callerSentList
        ? new Set([...keepUserIds, ctx.userId])
        : new Set([...activeUsersAll.map((u) => u.id)]);

      toDeactivate = activeUsersAll
        .map((u) => u.id)
        .filter((id) => !keepSet.has(id));

      finalSeats = requestedSeats;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      include: { organization: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    // Bloquear doble-subscribe (Audit 2026-06-24 HIGH refuerzo).
    // Antes solo chequeábamos por stripeSubscriptionId en DB — pero
    // hay un window entre completar el Stripe Checkout y que el
    // webhook checkout.session.completed attache el subId. Si el
    // admin re-clickea en ese window, la guard del DB está null y
    // creaba una 2da sub silenciosa (caso real reportado por Nicolás).
    //
    // Fix: doble guard.
    //   1. Si hay subId en DB: retrieve la sub específica.
    //   2. Si NO hay subId (o sub fue deleted en Stripe): list todas
    //      las subs del customer y bloquear si hay alguna activa/
    //      trialing/past_due. Captura subs creadas out-of-band
    //      (Dashboard manual) y el race del webhook lag.
    const blocked = ["active", "trialing", "past_due", "incomplete"];

    let blockingSubStatus: string | null = null;
    if (subscription.stripeSubscriptionId) {
      try {
        const existing = await getStripeClient().subscriptions.retrieve(
          subscription.stripeSubscriptionId,
        );
        if (blocked.includes(existing.status)) {
          blockingSubStatus = existing.status;
        }
      } catch (err: any) {
        if (err?.code !== "resource_missing") throw err;
        // Sub deleted en Stripe — caemos al fallback abajo.
      }
    }

    // Fallback: enumerar subs por customer (atrapa out-of-band + race
    // del webhook lag). `customerId` se setea más abajo, así que acá
    // usamos directamente subscription.stripeCustomerId (que es la
    // source). El check de "pending_" prefix skipea customers que
    // todavía no fueron creados en Stripe (signup sin checkout).
    if (
      !blockingSubStatus &&
      subscription.stripeCustomerId &&
      !subscription.stripeCustomerId.startsWith("pending_")
    ) {
      try {
        const subsForCustomer = await getStripeClient().subscriptions.list({
          customer: subscription.stripeCustomerId,
          status: "all",
          limit: 10,
        });
        for (const s of subsForCustomer.data) {
          if (blocked.includes(s.status)) {
            blockingSubStatus = s.status;
            // Bonus: si encontramos una active sub que NO matchea
            // nuestro subId en DB, attacheamos esa para evitar drift.
            if (!subscription.stripeSubscriptionId) {
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: { stripeSubscriptionId: s.id },
              });
            }
            break;
          }
        }
      } catch (err) {
        // Si Stripe falla acá, NO bloqueamos (fail-open) — caemos al
        // flow normal de creación. El webhook va a alertar cuando
        // detecte 2 subs en el mismo customer.
        console.error("[checkout] subscriptions.list fallback failed:", err);
      }
    }

    if (blockingSubStatus) {
      return NextResponse.json(
        {
          error: "You already have an active subscription. Use Manage billing to make changes.",
          code: "subscription_already_active",
          status: blockingSubStatus,
        },
        { status: 409 },
      );
    }

    // El target final es lo que el admin eligió (finalSeats) si pasó,
    // o el actual de la sub (que recalculateAndSyncSeats ya alineó
    // con active users count) si no.
    const seatsForCheckout = finalSeats ?? subscription.seats;

    if (seatsForCheckout > TEAM_MAX_SEATS) {
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

    // ── INLINE FLOW (Linkedin-style 2026-06-25) ────────────────────
    // Si el caller pidió inline Y hay PaymentMethod attached al
    // customer, creamos la sub directo via stripe.subscriptions.create
    // y devolvemos {ok:true, subscriptionId, status}. El frontend
    // cierra el dialog y redirige a /settings/billing?success=true
    // sin pasar por checkout.stripe.com.
    //
    // Si NO hay PM attached (signup sin checkout previo) devolvemos
    // {needsCheckout: true, ...} con 400 — el front cae al flow viejo
    // de Stripe Checkout (que sí pide card).
    //
    // 3DS / SCA: en TRIALING con trial_end futuro Stripe NO cobra al
    // crear la sub — la primera factura fire en trial_end y si pide
    // 3DS off-session ahí, Stripe maneja el dunning + recovery email
    // automáticamente. No hace falta confirmCardPayment client-side
    // para este flow.
    if (inline) {
      const stripe = getStripeClient();
      let paymentMethodId: string | null = null;
      try {
        const customer = await stripe.customers.retrieve(customerId, {
          expand: ["invoice_settings.default_payment_method"],
        });
        if (!customer.deleted) {
          const defaultPm = customer.invoice_settings?.default_payment_method;
          if (defaultPm) {
            paymentMethodId =
              typeof defaultPm === "string" ? defaultPm : defaultPm.id;
          }
        }
        if (!paymentMethodId) {
          const list = await stripe.paymentMethods.list({
            customer: customerId,
            type: "card",
            limit: 1,
          });
          paymentMethodId = list.data[0]?.id ?? null;
        }
      } catch (err) {
        console.error("[checkout inline] PM lookup failed:", err);
      }

      if (!paymentMethodId) {
        return NextResponse.json(
          {
            error: "No payment method on file. Add a card to continue.",
            needsCheckout: true,
          },
          { status: 400 },
        );
      }

      // Validar trial_end no pasado (mismo guard que createCheckoutSession).
      let trialEndTs: number | null = null;
      if (trialEnd) {
        if (trialEnd.getTime() <= Date.now()) {
          return NextResponse.json(
            {
              error: "Your trial expired while you were on this page. Refresh to continue.",
              code: "trial_already_expired",
            },
            { status: 409 },
          );
        }
        trialEndTs = Math.floor(trialEnd.getTime() / 1000);
      }

      let stripeSub;
      try {
        stripeSub = await stripe.subscriptions.create({
          customer: customerId,
          items: [
            {
              price: stripePriceIdForSeats(seatsForCheckout),
              quantity: seatsForCheckout,
            },
          ],
          default_payment_method: paymentMethodId,
          ...(trialEndTs ? { trial_end: trialEndTs } : {}),
          metadata: { organizationId: ctx.organizationId },
          expand: ["latest_invoice.payment_intent"],
        });
      } catch (err: any) {
        console.error("[checkout inline] subscriptions.create failed:", err);
        return NextResponse.json(
          {
            error: err?.message || "Subscription creation failed. Please retry.",
            code: err?.code || "stripe_error",
          },
          { status: 502 },
        );
      }

      // Sub creada OK en Stripe. Aplicamos cambios locales en tx atómica.
      const stripeSubAny = stripeSub as any;
      const firstItem = stripeSubAny.items?.data?.[0];
      const periodEndTs =
        firstItem?.current_period_end || stripeSubAny.current_period_end;
      const periodEnd = periodEndTs ? new Date(periodEndTs * 1000) : null;
      const mappedStatus = mapStripeStatus(
        stripeSubAny.status as string | undefined,
      );

      await prisma.$transaction([
        prisma.subscription.update({
          where: { organizationId: ctx.organizationId },
          data: {
            stripeSubscriptionId: stripeSub.id,
            ...(mappedStatus ? { status: mappedStatus } : {}),
            ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
            ...(finalSeats !== null ? { seats: finalSeats } : {}),
          },
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
        ok: true,
        inline: true,
        subscriptionId: stripeSub.id,
        status: stripeSubAny.status,
      });
    }

    // ── REDIRECT FLOW (Stripe Checkout) ────────────────────────────
    // Path original: cuando NO hay card on file (o el front no pidió
    // inline) creamos una Checkout Session de Stripe y devolvemos URL.
    let session;
    try {
      session = await createCheckoutSession(
        customerId,
        stripePriceIdForSeats(seatsForCheckout),
        seatsForCheckout,
        ctx.organizationId,
        trialEnd,
      );
    } catch (err: any) {
      // Trial expiró entre la decisión del cliente y el procesamiento.
      // Antes Stripe lo creaba ACTIVE y cobraba al toque sin avisar
      // (HIGH audit 2026-06-24). Ahora rechazamos con un mensaje
      // claro para que el front pueda re-renderizar la página con el
      // dialog correcto ("Trial expired — subscribe to keep access").
      if (err?.code === "trial_already_expired") {
        return NextResponse.json(
          {
            error: "Your trial expired while you were on this page. Refresh to continue.",
            code: "trial_already_expired",
          },
          { status: 409 },
        );
      }
      throw err;
    }

    // Stripe respondió OK. Recién ahora aplicamos los cambios locales
    // de forma atómica. Si la tx falla, el checkout en Stripe queda
    // creado pero no se deactivó a nadie ni se cambió DB.seats — el
    // admin va a ver mismatch en /settings/team y va a tener que
    // re-correr. Mejor que team-gutted-sin-pago. Audit 2026-06-23.
    if (toDeactivate.length > 0 || finalSeats !== null) {
      await prisma.$transaction([
        ...(toDeactivate.length > 0
          ? [
              prisma.user.updateMany({
                where: { id: { in: toDeactivate } },
                data: { isActive: false },
              }),
            ]
          : []),
        ...(finalSeats !== null
          ? [
              prisma.subscription.update({
                where: { organizationId: ctx.organizationId },
                data: { seats: finalSeats },
              }),
            ]
          : []),
      ]);
    }

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
