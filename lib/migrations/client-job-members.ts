/**
 * Backfill ClientJobMember rows for any ClientJob that has zero
 * members yet — those rows used to be "legacy-open" (visible to
 * every teammate at the client). After we removed that fallback in
 * lib/client-job-access.ts, jobs without members would become
 * invisible to everyone, which is the opposite of the bug we were
 * fixing. This migration seeds the implicit ALL-team semantics with
 * an explicit single-member row: the creator (postedById).
 *
 * Idempotent — once every active ClientJob has at least one member
 * row, subsequent boots cost one count() query.
 *
 * Operator may also run scripts/migrate-client-job-members.ts.
 */

import { prisma } from "../prisma";

export interface MigrationStats {
  scanned: number;
  seeded: number;
  durationMs: number;
  skipped?: boolean;
}

export async function runClientJobMemberBackfill(): Promise<MigrationStats> {
  const started = Date.now();

  // Fast path: every ClientJob has at least one member already.
  const orphans = await prisma.clientJob.findMany({
    where: { members: { none: {} } },
    select: { id: true, postedById: true },
  });

  if (orphans.length === 0) {
    return {
      scanned: 0,
      seeded: 0,
      durationMs: Date.now() - started,
      skipped: true,
    };
  }

  // Bulk create one ClientJobMember per orphan job, keyed by
  // postedById. createMany.skipDuplicates is defensive — the unique
  // index on (clientJobId, clientUserId) would normally make this
  // unnecessary, but a partial migration that crashes mid-flight
  // wouldn't want to abort the retry.
  const seedRows = orphans.map((j) => ({
    clientJobId: j.id,
    clientUserId: j.postedById,
  }));

  const result = await prisma.clientJobMember.createMany({
    data: seedRows,
    skipDuplicates: true,
  });

  return {
    scanned: orphans.length,
    seeded: result.count,
    durationMs: Date.now() - started,
  };
}
