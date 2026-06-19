import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";
import { syncSubFromStripe } from "@/lib/sync-stripe-seats";

export async function GET() {
  try {
    const ctx = await getOrgContext();

    // Self-healing: si hay sub en Stripe, hacemos pull para corregir
    // cualquier drift (currentPeriodEnd null post-checkout, cancel
    // manual desde Customer Portal que el webhook no procesó, seat
    // count desfasado, etc.). Idempotente: si todo coincide, no-op.
    // Errores de Stripe se logean y devolvemos la data DB existente.
    await syncSubFromStripe(ctx.organizationId);

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    return NextResponse.json(subscription);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
