import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendSubscriptionActivatedEmail } from "@/lib/email";
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
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { status: "CANCELED" },
      });
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

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          seats: quantity,
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : undefined,
          ...(mappedStatus && { status: mappedStatus }),
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
