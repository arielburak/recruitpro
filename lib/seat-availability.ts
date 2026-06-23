// Helper para el pool seat model. Antes de invitar / reactivar a un
// teammate, los endpoints deben chequear que hay seats disponibles
// en el pool comprado. Si no, devolver mensaje claro con CTA "Buy
// more seats" en lugar de meter un user free pasivo.
//
// Decisión 2026-06-22 con Nicolás: el modelo es "comprar pool y
// distribuir" — el admin compra N seats explícitamente y los asigna
// invitando members. No se suman seats automáticamente al invitar.
// Si quiere más, va a /settings/billing → Manage seats.
//
// Edge cases:
//   · COMP: ignora todo (acceso ilimitado, sin billing).
//   · TRIAL: ignora (experiencia libre durante el trial; al subscribir
//     el checkout reconcilia y compra los seats necesarios).
//   · ACTIVE / PAST_DUE / etc: enforce el pool.
//   · CANCELED: el flow de invite no debería estar accesible igual
//     (subscription gate lo bloquea antes), pero por safety devolvemos
//     "no_active_sub".

import { prisma } from "@/lib/prisma";

export type SeatAvailability =
  | { ok: true; current: number; pool: number; available: number }
  | {
      ok: false;
      reason: "pool_full" | "trial_limit" | "no_active_sub" | "no_subscription_row";
      current?: number;
      pool?: number;
      message: string;
    };

export async function checkSeatAvailability(
  organizationId: string,
  options: { additionalSeats?: number } = {},
): Promise<SeatAvailability> {
  const additionalSeats = options.additionalSeats ?? 1;

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { seats: true, status: true, isComp: true },
  });

  if (!subscription) {
    return {
      ok: false,
      reason: "no_subscription_row",
      message: "No subscription configured for this workspace.",
    };
  }

  // COMP y TRIAL no chequean — acceso libre. ACTIVE/PAST_DUE/UNPAID
  // sí enforcen el pool (PAST_DUE puede invitar mientras se resuelve
  // el cobro — no es el momento de bloquearlo por seats).
  if (subscription.isComp) {
    return { ok: true, current: 0, pool: 9999, available: 9999 };
  }
  if (subscription.status === "TRIALING") {
    // Trial = 1 active user (admin solo). Para invitar al equipo, se
    // subscriben. Decisión 2026-06-22 con Nicolás (modelo Linear/
    // Notion/Slack): el trial es para que el admin pruebe el ATS,
    // no para armar equipos gratis.
    const currentActiveUsers = await prisma.user.count({
      where: { organizationId, isActive: true },
    });
    if (currentActiveUsers + additionalSeats > 1) {
      return {
        ok: false,
        reason: "trial_limit",
        current: currentActiveUsers,
        pool: 1,
        message:
          "Trial is limited to 1 user. Subscribe to invite teammates.",
      };
    }
    return {
      ok: true,
      current: currentActiveUsers,
      pool: 1,
      available: 1 - currentActiveUsers,
    };
  }
  if (subscription.status === "CANCELED") {
    return {
      ok: false,
      reason: "no_active_sub",
      current: 0,
      pool: 0,
      message: "Subscription is canceled. Resubscribe to invite teammates.",
    };
  }

  // ACTIVE / PAST_DUE / UNPAID: chequear pool.
  const currentActiveUsers = await prisma.user.count({
    where: { organizationId, isActive: true },
  });

  const wouldBe = currentActiveUsers + additionalSeats;
  if (wouldBe > subscription.seats) {
    const missing = wouldBe - subscription.seats;
    return {
      ok: false,
      reason: "pool_full",
      current: currentActiveUsers,
      pool: subscription.seats,
      message: `You're using ${currentActiveUsers} of ${subscription.seats} seats. Buy ${missing} more seat${missing === 1 ? "" : "s"} to invite this teammate.`,
    };
  }

  return {
    ok: true,
    current: currentActiveUsers,
    pool: subscription.seats,
    available: subscription.seats - currentActiveUsers,
  };
}
