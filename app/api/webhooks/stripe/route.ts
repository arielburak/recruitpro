import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  sendSubscriptionActivatedEmail,
  sendSubscriptionCanceledEmail,
  sendSubscriptionEndedEmail,
  sendSubscriptionReactivatedEmail,
  sendPaymentFailedEmail,
} from "@/lib/email";
import { monthlyTotalCents } from "@/lib/constants";
import Stripe from "stripe";

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
          // Anomalia — el customer del checkout NO matchea el customer
          // que guardamos cuando se creo la suscripcion. No tocamos
          // nada y dejamos en Sentry para investigar.
          console.error(
            "[stripe webhook] checkout.session.completed customer mismatch:",
            { orgId, sessionCustomer: customerId, dbCustomer: existing?.stripeCustomerId },
          );
          break;
        }
        await prisma.subscription.update({
          where: { organizationId: orgId },
          data: {
            stripeSubscriptionId: session.subscription as string,
            status: "ACTIVE",
          },
        });

        // Email transaccional al admin del org confirmando subscription
        // activa. Stripe ya manda su propio recibo (si el dashboard
        // tiene "Customer emails" activado) — esto es el toque
        // personalizado del ATS con onboarding info.
        try {
          const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: {
              users: {
                where: { role: "ADMIN", isActive: true },
                select: { name: true, email: true },
                orderBy: { createdAt: "asc" },
                take: 1,
              },
              subscription: { select: { seats: true } },
            },
          });
          const admin = org?.users?.[0];
          if (admin?.email && org) {
            const seats = org.subscription?.seats || 1;
            const monthlyTotal = monthlyTotalCents(seats) / 100;
            const baseUrl =
              process.env.NEXTAUTH_URL ||
              process.env.NEXT_PUBLIC_APP_URL ||
              "https://recruitingats.com";
            await sendSubscriptionActivatedEmail({
              to: admin.email,
              recipientName: admin.name || "",
              organizationName: org.name,
              seats,
              monthlyTotalDollars: monthlyTotal,
              dashboardUrl: `${baseUrl}/dashboard`,
              manageBillingUrl: `${baseUrl}/settings/billing`,
            });
          }
        } catch (emailErr) {
          // No bloqueamos el webhook si el email falla — la sub ya
          // está activa en DB, eso es lo importante.
          console.error("[stripe webhook] activation email failed:", emailErr);
        }
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

        // Email al admin avisando que el pago falló y tiene que
        // actualizar el método de pago.
        try {
          const sub = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId: invoice.subscription as string },
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
          const admin = sub?.organization?.users?.[0];
          if (admin?.email && sub) {
            const baseUrl =
              process.env.NEXTAUTH_URL ||
              process.env.NEXT_PUBLIC_APP_URL ||
              "https://recruitingats.com";
            await sendPaymentFailedEmail({
              to: admin.email,
              recipientName: admin.name || "",
              organizationName: sub.organization.name,
              manageBillingUrl: `${baseUrl}/settings/billing`,
            });
          }
        } catch (emailErr) {
          console.error("[stripe webhook] payment_failed email failed:", emailErr);
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
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

      // Email "Your subscription has ended" al admin.
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
        console.error("[stripe webhook] subscription_ended email failed:", emailErr);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as any;
      const quantity = subscription.items?.data?.[0]?.quantity || 1;
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
      const willCancel = Boolean(subscription.cancel_at_period_end);
      const cancelAtTs = subscription.cancel_at || subscription.current_period_end;

      // Lookup del state previo para saber si la cancel-at-period-end
      // flag cambió en este event. Sin esto mandaríamos el email de
      // cancel cada vez que Stripe manda subscription.updated.
      const existingSub = await prisma.subscription.findFirst({
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
      const wasCanceling = existingSub?.cancelAtPeriodEnd ?? false;
      const becameCanceling = willCancel && !wasCanceling;
      const becameReactivated = !willCancel && wasCanceling;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          seats: quantity,
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : undefined,
          cancelAtPeriodEnd: willCancel,
          ...(mappedStatus && { status: mappedStatus }),
        },
      });

      // Disparar email según la transición. Solo si la flag CAMBIÓ —
      // no en cada subscription.updated event (que llega también para
      // seat changes, payment method update, etc).
      const admin = existingSub?.organization?.users?.[0];
      const baseUrl =
        process.env.NEXTAUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://recruitingats.com";

      if (becameCanceling && admin?.email && existingSub) {
        try {
          await sendSubscriptionCanceledEmail({
            to: admin.email,
            recipientName: admin.name || "",
            organizationName: existingSub.organization.name,
            cancelAt: cancelAtTs ? new Date(cancelAtTs * 1000) : new Date(),
            reactivateUrl: `${baseUrl}/settings/billing`,
          });
        } catch (emailErr) {
          console.error("[stripe webhook] canceled email failed:", emailErr);
        }
      }

      if (becameReactivated && admin?.email && existingSub) {
        try {
          await sendSubscriptionReactivatedEmail({
            to: admin.email,
            recipientName: admin.name || "",
            organizationName: existingSub.organization.name,
            nextBillingDate: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : null,
            dashboardUrl: `${baseUrl}/settings/billing`,
          });
        } catch (emailErr) {
          console.error("[stripe webhook] reactivated email failed:", emailErr);
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
