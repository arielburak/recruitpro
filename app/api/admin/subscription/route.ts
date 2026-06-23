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
    const isAdmin = ctx.role === "ADMIN";

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

    // Privacy: USER recibe SOLO campos non-sensitive necesarios para
    // banners de trial countdown y gating de UX. ADMIN recibe todo
    // (stripeCustomerId, períodos, lista de active users con emails)
    // para el subscribe/portal flow. Audit 2026-06-23.
    if (!isAdmin) {
      return NextResponse.json(
        {
          status: subscription?.status ?? null,
          trialEndsAt: subscription?.trialEndsAt ?? null,
          isComp: subscription?.isComp ?? false,
          userCreatedAt: user?.createdAt ?? null,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // Pool seat model 2026-06-22: front necesita active users count Y
    // la lista completa (para el subscribe dialog donde el admin elige
    // quién mantiene acceso si compra menos seats que active users).
    const activeUsersList = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    const activeUsersCount = activeUsersList.length;

    return NextResponse.json(
      {
        ...subscription,
        userCreatedAt: user?.createdAt ?? null,
        activeUsersCount,
        activeUsersList,
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
