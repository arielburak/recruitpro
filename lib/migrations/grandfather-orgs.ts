import { prisma } from "@/lib/prisma";

/**
 * One-shot backfill: mark every Subscription created before the cutoff
 * as `isComp: true` so all founding / test accounts stay on "free
 * forever" regardless of Stripe trial/paid status.
 *
 * Idempotent — second run finds no candidates (either isComp is already
 * true or the row is newer than the cutoff) and returns 0 in ~1 query.
 * New orgs created after the cutoff keep the schema default isComp=false
 * and go through the normal trial flow.
 *
 * Cutoff frozen to the day this landed so we don't accidentally keep
 * comping accounts created after rollout.
 */
const GRANDFATHER_CUTOFF = new Date("2026-04-23T23:59:59Z");

export async function grandfatherExistingOrgs() {
  const started = Date.now();
  const result = await prisma.subscription.updateMany({
    where: {
      isComp: false,
      createdAt: { lt: GRANDFATHER_CUTOFF },
    },
    data: { isComp: true },
  });
  return {
    comped: result.count,
    cutoff: GRANDFATHER_CUTOFF.toISOString(),
    durationMs: Date.now() - started,
  };
}
