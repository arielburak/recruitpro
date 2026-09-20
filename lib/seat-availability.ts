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

// El mismo cliente de Prisma o el de una transaccion. Necesario para
// que el chequeo de seats corra DENTRO del lock de `reserveSeat`.
type DbClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function checkSeatAvailability(
  organizationId: string,
  options: { additionalSeats?: number } = {},
  db: DbClient = prisma,
): Promise<SeatAvailability> {
  const additionalSeats = options.additionalSeats ?? 1;

  const subscription = await db.subscription.findUnique({
    where: { organizationId },
    select: { seats: true, status: true, isComp: true, trialEndsAt: true },
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
    // Trial = invitar libre, todos pueden usar el ATS. Al subscribirse
    // (al fin del trial o cuando el admin quiera), el admin elige
    // cuántos seats comprar — puede ser ≤ active users. Si elige
    // menos, los extra quedan deactivated. Decisión 2026-06-22 con
    // Nicolás (pivote final).
    //
    // Pero SOLO mientras el trial siga vivo. Antes no se miraba
    // `trialEndsAt`, y el status queda en TRIALING hasta que corre el
    // cron diario: en esa ventana un invite emitido antes del
    // vencimiento se aceptaba con seat asignado, aunque el resto del
    // producto ya devolvia 402. Era la puerta abierta tanto en
    // /api/invite/[token] como en su gemelo de OAuth.
    const trialAlive =
      !subscription.trialEndsAt || subscription.trialEndsAt.getTime() > Date.now();
    if (trialAlive) {
      return { ok: true, current: 0, pool: 9999, available: 9999 };
    }
    return {
      ok: false,
      reason: "no_active_sub",
      current: 0,
      pool: 0,
      message: "Your free trial has ended. Subscribe to invite teammates.",
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
  const currentActiveUsers = await db.user.count({
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

/**
 * Reserva un seat y hace la escritura que lo consume, de forma atomica.
 *
 * `checkSeatAvailability` sola NO alcanza: entre su `count()` y el
 * `create()` del caller hay una ventana, y todo lo que entre ahi pasa
 * el mismo chequeo. Medido en QA: 8 invitaciones aceptadas en paralelo
 * dejaron 9 usuarios activos sobre un pool de 2 (el `bcrypt.hash` del
 * alta, ~250ms, mantiene a todos dentro de la ventana). Y no hacia
 * falta mala fe: un equipo que abre sus invitaciones la misma mañana
 * lo reproduce.
 *
 * Lo grave era que nadie lo corregia despues: `reconcileSeats` compara
 * `Stripe.quantity` contra `Subscription.seats`, nunca contra la
 * cantidad de usuarios activos. Los dos numeros coincidian y los
 * usuarios de mas quedaban invisibles para siempre, facturando de
 * menos.
 *
 * El `FOR UPDATE` sobre la fila de Subscription serializa a los que
 * compiten por el mismo pool: el segundo espera al primero y recuenta
 * ya con el usuario nuevo adentro.
 */
export async function reserveSeat<T>(
  organizationId: string,
  write: (tx: DbClient) => Promise<T>,
  options: { additionalSeats?: number } = {},
): Promise<{ ok: true; result: T } | Extract<SeatAvailability, { ok: false }>> {
  return prisma.$transaction(async (tx) => {
    // Lock de fila. Si la org no tiene Subscription no bloquea nada y
    // el chequeo de abajo devuelve "no_subscription_row".
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${organizationId} FOR UPDATE`;

    const availability = await checkSeatAvailability(organizationId, options, tx as DbClient);
    if (!availability.ok) return availability;

    const result = await write(tx as DbClient);
    return { ok: true as const, result };
  });
}
