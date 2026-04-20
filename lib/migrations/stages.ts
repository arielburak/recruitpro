/**
 * Bring every Job's PipelineStage set and every Client's ClientPipelineStage
 * set to the canonical 9-stage pipeline (lib/constants.ts → DEFAULT_STAGES).
 *
 * Idempotent: tenants already at the canonical shape are skipped. Used by:
 *   - scripts/migrate-stages-to-canonical.ts (one-shot CLI)
 *   - instrumentation.ts (auto-run once per server boot after deploy)
 *
 * For each tenant: existing stages get renamed/renumbered in place where
 * they map to a canonical stage (via exact match or LEGACY_STAGE_ALIASES),
 * preserving their id so CandidateSubmission.stageId / clientStageId FKs
 * stay intact. Any stages that don't map (old customizations) have their
 * submissions drained to the first canonical stage before the row is
 * dropped. Missing canonical stages are inserted.
 */
import { prisma } from "../prisma";
import { DEFAULT_STAGES, LEGACY_STAGE_ALIASES } from "../constants";

const PARKING_OFFSET = 10000;

export interface MigrationStats {
  jobsNormalized: number;
  jobsTotal: number;
  clientsNormalized: number;
  clientsTotal: number;
  stagesCreated: number;
  stagesDeleted: number;
  submissionsMoved: number;
  durationMs: number;
  skipped?: boolean;
}

function canonicalNameFor(legacy: string): string {
  return LEGACY_STAGE_ALIASES[legacy] ?? legacy;
}

// Cheap check: if no legacy stage names remain AND no one has an unexpected
// stage count, the migration has already run. Used as a fast path so boot-
// time callers don't hit the DB per-tenant on every cold start.
async function alreadyFullyMigrated(): Promise<boolean> {
  const legacyNames = Object.keys(LEGACY_STAGE_ALIASES);
  const [legacyPipeline, legacyClient] = await Promise.all([
    prisma.pipelineStage.count({ where: { name: { in: legacyNames } } }),
    prisma.clientPipelineStage.count({ where: { name: { in: legacyNames } } }),
  ]);
  if (legacyPipeline > 0 || legacyClient > 0) return false;

  // Also verify every job and every client has exactly DEFAULT_STAGES.length
  // stages — catches the case where a tenant has a custom extra stage.
  const [jobsWithWrongCount, clientsWithWrongCount] = await Promise.all([
    prisma.job.count({
      where: {
        NOT: {
          stages: { some: {} },
        },
      },
    }).then(async () => {
      // Count jobs whose stage-count differs from DEFAULT_STAGES.length.
      const rows = await prisma.job.findMany({
        select: { id: true, _count: { select: { stages: true } } },
      });
      return rows.filter((r) => r._count.stages !== DEFAULT_STAGES.length).length;
    }),
    prisma.client.findMany({
      select: { id: true, _count: { select: { pipelineStages: true } } },
    }).then((rows) => rows.filter((r) => r._count.pipelineStages !== DEFAULT_STAGES.length).length),
  ]);

  return jobsWithWrongCount === 0 && clientsWithWrongCount === 0;
}

async function migrateJobStages(stats: MigrationStats) {
  const jobs = await prisma.job.findMany({ select: { id: true } });
  stats.jobsTotal = jobs.length;

  for (const job of jobs) {
    const existing = await prisma.pipelineStage.findMany({
      where: { jobId: job.id },
      orderBy: { order: "asc" },
      include: { _count: { select: { submissions: true } } },
    });

    const claimed = new Set<string>();
    const resolution = DEFAULT_STAGES.map((canonical) => {
      const match = existing.find(
        (e) => !claimed.has(e.id) && canonicalNameFor(e.name) === canonical.name
      );
      if (match) claimed.add(match.id);
      return { canonical, matchId: match?.id ?? null };
    });

    const orphans = existing.filter((e) => !claimed.has(e.id));

    const alreadyCanonical =
      existing.length === DEFAULT_STAGES.length &&
      orphans.length === 0 &&
      resolution.every((r, i) => {
        const row = existing.find((e) => e.id === r.matchId);
        return (
          row &&
          row.name === r.canonical.name &&
          row.order === i &&
          row.color === r.canonical.color &&
          row.isTerminal === r.canonical.isTerminal &&
          (row.kind ?? null) === (r.canonical.kind ?? null)
        );
      });

    if (alreadyCanonical) continue;

    const firstCanonicalId = resolution[0].matchId;

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < existing.length; i++) {
        await tx.pipelineStage.update({
          where: { id: existing[i].id },
          data: { order: PARKING_OFFSET + i },
        });
      }

      let firstStageId = firstCanonicalId;
      for (let i = 0; i < resolution.length; i++) {
        const { canonical, matchId } = resolution[i];
        if (matchId) {
          await tx.pipelineStage.update({
            where: { id: matchId },
            data: {
              name: canonical.name,
              order: i,
              color: canonical.color,
              isTerminal: canonical.isTerminal,
              kind: canonical.kind,
            },
          });
          if (i === 0) firstStageId = matchId;
        } else {
          const created = await tx.pipelineStage.create({
            data: {
              name: canonical.name,
              order: i,
              color: canonical.color,
              isTerminal: canonical.isTerminal,
              kind: canonical.kind,
              jobId: job.id,
            },
          });
          stats.stagesCreated++;
          if (i === 0) firstStageId = created.id;
        }
      }

      if (!firstStageId) {
        throw new Error(`No first stage for job ${job.id} — unreachable`);
      }

      for (const orphan of orphans) {
        if (orphan._count.submissions > 0) {
          const moved = await tx.candidateSubmission.updateMany({
            where: { stageId: orphan.id },
            data: { stageId: firstStageId },
          });
          stats.submissionsMoved += moved.count;
        }
        await tx.pipelineStage.delete({ where: { id: orphan.id } });
        stats.stagesDeleted++;
      }
    });

    stats.jobsNormalized++;
  }
}

async function migrateClientStages(stats: MigrationStats) {
  const clients = await prisma.client.findMany({ select: { id: true } });
  stats.clientsTotal = clients.length;

  for (const client of clients) {
    const existing = await prisma.clientPipelineStage.findMany({
      where: { clientId: client.id },
      orderBy: { order: "asc" },
      include: { _count: { select: { submissions: true } } },
    });

    const claimed = new Set<string>();
    const resolution = DEFAULT_STAGES.map((canonical) => {
      const match = existing.find(
        (e) => !claimed.has(e.id) && canonicalNameFor(e.name) === canonical.name
      );
      if (match) claimed.add(match.id);
      return { canonical, matchId: match?.id ?? null };
    });

    const orphans = existing.filter((e) => !claimed.has(e.id));

    const alreadyCanonical =
      existing.length === DEFAULT_STAGES.length &&
      orphans.length === 0 &&
      resolution.every((r, i) => {
        const row = existing.find((e) => e.id === r.matchId);
        return (
          row &&
          row.name === r.canonical.name &&
          row.order === i &&
          row.color === r.canonical.color &&
          row.isTerminal === r.canonical.isTerminal &&
          (row.kind ?? null) === (r.canonical.kind ?? null)
        );
      });

    if (alreadyCanonical) continue;

    const firstCanonicalId = resolution[0].matchId;

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < existing.length; i++) {
        await tx.clientPipelineStage.update({
          where: { id: existing[i].id },
          data: { order: PARKING_OFFSET + i },
        });
      }

      let firstStageId = firstCanonicalId;
      for (let i = 0; i < resolution.length; i++) {
        const { canonical, matchId } = resolution[i];
        if (matchId) {
          await tx.clientPipelineStage.update({
            where: { id: matchId },
            data: {
              name: canonical.name,
              order: i,
              color: canonical.color,
              isTerminal: canonical.isTerminal,
              kind: canonical.kind,
            },
          });
          if (i === 0) firstStageId = matchId;
        } else {
          const created = await tx.clientPipelineStage.create({
            data: {
              name: canonical.name,
              order: i,
              color: canonical.color,
              isTerminal: canonical.isTerminal,
              kind: canonical.kind,
              clientId: client.id,
            },
          });
          stats.stagesCreated++;
          if (i === 0) firstStageId = created.id;
        }
      }

      if (!firstStageId) {
        throw new Error(`No first stage for client ${client.id} — unreachable`);
      }

      for (const orphan of orphans) {
        if (orphan._count.submissions > 0) {
          const moved = await tx.candidateSubmission.updateMany({
            where: { clientStageId: orphan.id },
            data: { clientStageId: firstStageId },
          });
          stats.submissionsMoved += moved.count;
        }
        await tx.clientPipelineStage.delete({ where: { id: orphan.id } });
        stats.stagesDeleted++;
      }
    });

    stats.clientsNormalized++;
  }
}

export async function runStageMigration(): Promise<MigrationStats> {
  const started = Date.now();
  const stats: MigrationStats = {
    jobsNormalized: 0,
    jobsTotal: 0,
    clientsNormalized: 0,
    clientsTotal: 0,
    stagesCreated: 0,
    stagesDeleted: 0,
    submissionsMoved: 0,
    durationMs: 0,
  };

  if (await alreadyFullyMigrated()) {
    stats.durationMs = Date.now() - started;
    stats.skipped = true;
    return stats;
  }

  await migrateJobStages(stats);
  await migrateClientStages(stats);

  stats.durationMs = Date.now() - started;
  return stats;
}
