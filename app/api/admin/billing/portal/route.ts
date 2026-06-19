import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createBillingPortalSession } from "@/lib/stripe";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST() {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    });

    if (!subscription || subscription.stripeCustomerId.startsWith("pending_")) {
      return NextResponse.json({ error: "No active billing" }, { status: 400 });
    }

    const session = await createBillingPortalSession(subscription.stripeCustomerId);
    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
