/**
 * One-shot migration: bring every Job's PipelineStage set and every Client's
 * ClientPipelineStage set to the canonical 9-stage pipeline defined in
 * lib/constants.ts (DEFAULT_STAGES).
 *
 * Idempotent. Safe to re-run: tenants already at the canonical shape are
 * skipped.
 *
 * Algorithm per tenant:
 *   1. Read existing stages sorted by order.
 *   2. Build a match: for each canonical stage, find the existing stage that
 *      should become it (exact name match, or via LEGACY_STAGE_ALIASES).
 *   3. Shift every existing stage to a safe "parking" order (10000+) in one
 *      pass, so the unique[jobId, order] / unique[clientId, order] index
 *      doesn't fight us during the real renumber.
 *   4. For each canonical stage: either update the matched existing row
 *      (rename + renumber + retag) or insert a fresh row.
 *   5. Any remaining existing stages (not matched to any canonical name):
 *        - if they have submissions, move those submissions to the FIRST
 *          canonical stage
 *        - then delete the orphan stage
 *
 * Because matched rows keep their id, all CandidateSubmission.stageId and
 * CandidateSubmission.clientStageId FKs stay intact — candidates don't jump
 * around the board.
 */
import { prisma } from "../lib/prisma";
import { DEFAULT_STAGES, LEGACY_STAGE_ALIASES } from "../lib/constants";

const PARKING_OFFSET = 10000;

function canonicalNameFor(legacy: string): string {
  return LEGACY_STAGE_ALIASES[legacy] ?? legacy;
}

async function migrateJobStages() {
  const jobs = await prisma.job.findMany({ select: { id: true, title: true } });
  console.log(`\nJobs: ${jobs.length}`);

  let jobsNormalized = 0;
  let stagesCreated = 0;
  let stagesDeleted = 0;
  let submissionsMoved = 0;

  for (const job of jobs) {
    const existing = await prisma.pipelineStage.findMany({
      where: { jobId: job.id },
      orderBy: { order: "asc" },
      include: { _count: { select: { submissions: true } } },
    });

    // Decide which existing row (if any) maps to each canonical stage.
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

    const firstCanonicalId = resolution[0].matchId; // may be null if no Sourced/alias exists

    await prisma.$transaction(async (tx) => {
      // Park all existing rows out of the unique-order space
      for (let i = 0; i < existing.length; i++) {
        await tx.pipelineStage.update({
          where: { id: existing[i].id },
          data: { order: PARKING_OFFSET + i },
        });
      }

      // Apply canonical state (reuse IDs where we can)
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
          stagesCreated++;
          if (i === 0) firstStageId = created.id;
        }
      }

      if (!firstStageId) {
        throw new Error(`No first stage for job ${job.id} — unreachable`);
      }

      // Drain orphan stages' submissions into the first canonical stage, then drop them
      for (const orphan of orphans) {
        if (orphan._count.submissions > 0) {
          const moved = await tx.candidateSubmission.updateMany({
            where: { stageId: orphan.id },
            data: { stageId: firstStageId },
          });
          submissionsMoved += moved.count;
        }
        await tx.pipelineStage.delete({ where: { id: orphan.id } });
        stagesDeleted++;
      }
    });

    jobsNormalized++;
    console.log(`✓ job "${job.title}" (${job.id}) normalized`);
  }

  console.log(
    `Jobs normalized: ${jobsNormalized}/${jobs.length} | stages +${stagesCreated}/-${stagesDeleted} | submissions moved: ${submissionsMoved}`
  );
}

async function migrateClientStages() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  console.log(`\nClients: ${clients.length}`);

  let clientsNormalized = 0;
  let stagesCreated = 0;
  let stagesDeleted = 0;
  let submissionsMoved = 0;

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
          stagesCreated++;
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
          submissionsMoved += moved.count;
        }
        await tx.clientPipelineStage.delete({ where: { id: orphan.id } });
        stagesDeleted++;
      }
    });

    clientsNormalized++;
    console.log(`✓ client "${client.name}" (${client.id}) normalized`);
  }

  console.log(
    `Clients normalized: ${clientsNormalized}/${clients.length} | stages +${stagesCreated}/-${stagesDeleted} | submissions moved: ${submissionsMoved}`
  );
}

async function main() {
  console.log("Migrating all tenants to the canonical 9-stage pipeline...");
  await migrateJobStages();
  await migrateClientStages();
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
