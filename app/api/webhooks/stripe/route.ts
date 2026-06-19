import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendSubscriptionEndedEmail } from "@/lib/email";
import Stripe from "stripe";

// Decisión 2026-06-19 con Nicolás: la mayoría de los emails de billing
// los manda Stripe directo desde Customer Portal (Dashboard → Settings
// → Customer emails) — recibos, payment failed. Sacamos los emails
// custom del ATS para no duplicar.
//
// Excepción única: cuando la sub realmente termina (subscription.deleted)
// queremos mandar nuestro propio email con CTA "Resubscribe" porque el
// email genérico de Stripe ("tu sub se canceló") no invita a volver.
// Para evitar duplicado el toggle "Send canceled subscription emails"
// de Stripe DEBE quedar DESACTIVADO. Los demás senders en lib/email.ts
// quedan declarados pero sin uso.

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripeClient().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.organizationId;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      // Cross-validation contra el row de Subscription: el metadata
      // organizationId viene del checkout que iniciamos nosotros, pero
      // si alguna vez el flow se compromete (e.g. middleware hijack),
      // un atacante podria activar suscripcion de otra org. Antes de
      // marcar ACTIVE confirmamos que el stripeCustomerId del session
      // matchea con el cliente que ya guardamos para ese org.
      if (orgId && session.subscription && customerId) {
        const existing = await prisma.subscription.findUnique({
          where: { organizationId: orgId },
          select: { stripeCustomerId: true },
        });
        if (!existing || existing.stripeCustomerId !== customerId) {
          console.error(
            "[stripe webhook] checkout.session.completed customer mismatch:",
            { orgId, sessionCustomer: customerId, dbCustomer: existing?.stripeCustomerId },
          );
          break;
        }
        // Fetch full subscription details from Stripe so we set
        // current_period_end y seats correctamente en el primer
        // update — sin depender de que después llegue invoice.paid
        // o subscription.updated. Si esos eventos se demoran o se
        // pierden, el UI muestra "Next billing: —" hasta el próximo
        // ciclo. Una llamada API extra acá lo evita.
        let periodEnd: Date | undefined;
        let quantity = 1;
        try {
          const stripe = getStripeClient();
          const stripeSub = (await stripe.subscriptions.retrieve(
            session.subscription as string,
          )) as any;
          // Stripe API 2025-09+ movió current_period_end de root a
          // items.data[i].current_period_end. Buscar primero ahí,
          // fallback al root.
          const firstItem = stripeSub.items?.data?.[0];
          const periodEndTs =
            firstItem?.current_period_end || stripeSub.current_period_end;
          if (periodEndTs) {
            periodEnd = new Date(periodEndTs * 1000);
          }
          quantity = firstItem?.quantity || 1;
        } catch (retrieveErr) {
          // Si Stripe falla, igual marcamos ACTIVE — el fix queda
          // para cuando llegue el subscription.updated.
          console.error(
            "[stripe webhook] failed to retrieve sub on checkout:",
            retrieveErr,
          );
        }

        await prisma.subscription.update({
          where: { organizationId: orgId },
          data: {
            stripeSubscriptionId: session.subscription as string,
            status: "ACTIVE",
            seats: quantity,
            ...(periodEnd && { currentPeriodEnd: periodEnd }),
          },
        });
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as any;
      if (invoice.subscription) {
        const sub = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: invoice.subscription as string },
        });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: "ACTIVE",
              currentPeriodEnd: new Date((invoice.lines?.data[0]?.period?.end || 0) * 1000),
            },
          });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as any;
      if (invoice.subscription) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: { status: "PAST_DUE" },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      // Lookup del admin antes del update para mandar el email
      // "Your subscription has ended → come back" con CTA Resubscribe.
      // Es el único email custom que sobrevive — Stripe puede mandar
      // "tu sub se canceló" pero sin CTA fuerte de re-suscribirse,
      // y este es el momento clave para invitar al cliente a volver.
      const sub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
        include: {
          organization: {
            include: {
              users: {
                where: { role: "ADMIN", isActive: true },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { name: true, email: true },
              },
            },
          },
        },
      });

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { status: "CANCELED", cancelAtPeriodEnd: false },
      });

      try {
        const admin = sub?.organization?.users?.[0];
        if (admin?.email && sub) {
          const baseUrl =
            process.env.NEXTAUTH_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            "https://recruitingats.com";
          await sendSubscriptionEndedEmail({
            to: admin.email,
            recipientName: admin.name || "",
            organizationName: sub.organization.name,
            resubscribeUrl: `${baseUrl}/settings/billing`,
          });
        }
      } catch (emailErr) {
        // No bloqueamos el webhook si el email falla — la sub ya
        // está CANCELED en DB, eso es lo importante.
        console.error("[stripe webhook] subscription_ended email failed:", emailErr);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as any;
      const firstItem = subscription.items?.data?.[0];
      const quantity = firstItem?.quantity || 1;
      // API 2025-09+ movió current_period_end al item. Buscar ahí
      // primero, fallback al root.
      const periodEndTs =
        firstItem?.current_period_end || subscription.current_period_end;
      // Stripe subscription status → nuestro enum. Pre-fix solo mapeaba
      // active y past_due — cuando llegaba un update con status=canceled
      // (caso documentado: cancel_at_period_end → final del periodo) la
      // sub seguía como ACTIVE en la DB y el guard de subscription la
      // dejaba seguir usando el ATS sin pagar. Mapeamos los 6 valores
      // posibles de Stripe que conocemos. Cualquier otro queda
      // undefined (no se toca el campo) para no pisar con basura un
      // estado válido pre-existente.
      const stripeStatus = subscription.status as string | undefined;
      let mappedStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "TRIALING" | undefined;
      if (stripeStatus === "active") mappedStatus = "ACTIVE";
      else if (stripeStatus === "past_due") mappedStatus = "PAST_DUE";
      else if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") mappedStatus = "CANCELED";
      else if (stripeStatus === "unpaid") mappedStatus = "UNPAID";
      else if (stripeStatus === "trialing") mappedStatus = "TRIALING";

      // Capturar cancel_at_period_end de Stripe. true cuando el
      // cliente clickeó "Cancelar" en el Customer Portal y la sub
      // sigue ACTIVE hasta el end del period. false cuando reactiva.
      // La UI lee este flag para mostrar la card amber "Scheduled to
      // cancel" y el CTA Reactivate.
      const willCancel = Boolean(subscription.cancel_at_period_end);

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          seats: quantity,
          currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000) : undefined,
          cancelAtPeriodEnd: willCancel,
          ...(mappedStatus && { status: mappedStatus }),
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
