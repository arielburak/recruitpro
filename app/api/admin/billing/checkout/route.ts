import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createCheckoutSession, createStripeCustomer } from "@/lib/stripe";
import { stripePriceIdForSeats, TEAM_MAX_SEATS } from "@/lib/constants";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST() {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
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

    const session = await createCheckoutSession(
      customerId,
      stripePriceIdForSeats(subscription.seats),
      subscription.seats,
      ctx.organizationId
    );

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
