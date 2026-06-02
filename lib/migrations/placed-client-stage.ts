/**
 * Backfill `CandidateSubmission.clientStageId` for placements whose
 * agency stage is "Placed" but whose client-side stage is still
 * something earlier ("Offered" / etc).
 *
 * Background: the original /api/placements POST set the agency
 * `stageId` to Placed but never updated `clientStageId`, so the
 * client portal kanban kept showing the candidate under the stage
 * they were in before the placement closed. PR #251 fixed the
 * forward path; this migration fixes the existing rows.
 *
 * Idempotent — once every Placed row has its clientStage aligned,
 * subsequent boots pay one count() query.
 */
import { prisma } from "../prisma";

export interface MigrationStats {
  scanned: number;
  updated: number;
  durationMs: number;
  skipped?: boolean;
}

export async function runPlacedClientStageBackfill(): Promise<MigrationStats> {
  const started = Date.now();

  // Find every submission that's been Placed on the agency side but
  // whose client-side stage hasn't caught up.
  const candidates = await prisma.candidateSubmission.findMany({
    where: {
      placement: { isNot: null },
      stage: { name: "Placed" },
      OR: [
        { clientStageId: null },
        { clientStage: { name: { not: "Placed" } } },
      ],
    },
    select: {
      id: true,
      clientStageId: true,
      job: { select: { clientId: true } },
    },
  });

  if (candidates.length === 0) {
    return {
      scanned: 0,
      updated: 0,
      durationMs: Date.now() - started,
      skipped: true,
    };
  }

  // Cache the per-client "Placed" stage id so we don't re-query for
  // every submission.
  const placedStageByClient = new Map<string, string>();
  let updated = 0;

  for (const sub of candidates) {
    const clientId = sub.job?.clientId;
    if (!clientId) continue;
    let placedId = placedStageByClient.get(clientId);
    if (!placedId) {
      const stage = await prisma.clientPipelineStage.findFirst({
        where: { clientId, name: "Placed" },
        select: { id: true },
      });
      if (!stage) continue;
      placedId = stage.id;
      placedStageByClient.set(clientId, placedId);
    }
    if (sub.clientStageId === placedId) continue;
    await prisma.candidateSubmission.update({
      where: { id: sub.id },
      data: { clientStageId: placedId },
    });
    updated += 1;
  }

  return {
    scanned: candidates.length,
    updated,
    durationMs: Date.now() - started,
  };
}
