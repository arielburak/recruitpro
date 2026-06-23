import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";
import { syncSubFromStripe } from "@/lib/sync-stripe-seats";

// No-cache: la billing page necesita data fresca siempre, especial
// cuando el user vuelve del Customer Portal de Stripe. Sin esto
// browser/CDN/proxies podían servir respuesta cacheada con el
// estado viejo y el user veía "Active" después de cancelar.
export const dynamic = "force-dynamic";

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

    // Para que el TrialCountdown popup pueda decidir si está en el
    // momento del signup (no mostrar) vs un login posterior (sí). Si
    // userCreatedAt < ~5min, el popup hace early return — feedback de
    // Nicolás 2026-06-22.
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { createdAt: true },
    });

    // Pool seat model 2026-06-22: el front necesita active users count
    // para mostrar "X of Y seats in use" + bloquear invites si el pool
    // está full. Es 1 query indexed, cheap.
    const activeUsersCount = await prisma.user.count({
      where: { organizationId: ctx.organizationId, isActive: true },
    });

    return NextResponse.json(
      {
        ...subscription,
        userCreatedAt: user?.createdAt ?? null,
        activeUsersCount,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
