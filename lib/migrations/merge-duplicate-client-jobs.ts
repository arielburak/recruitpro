/**
 * Backfill: merge duplicate ClientJob rows that point at the same
 * underlying agency Job.
 *
 * Background: when a client posts a search FIRST (ClientJob #1) and
 * then the agency runs "Invite Client" on the agency Job that backed
 * the accepted engagement, the historical code created a SECOND
 * ClientJob mirror (ClientJob #2, with `sourceJobId` set). PR #254
 * added a dedup check that prevents this going forward; this
 * migration cleans up the rows that already existed.
 *
 * Merge policy:
 *   - "Canonical" = the row WITHOUT `sourceJobId` (the original
 *     client-posted job). If both rows have `sourceJobId` we fall
 *     back to the older `createdAt`.
 *   - Carry-over: ClientJobMember rows from the mirror are folded
 *     into the canonical (deduped against existing members);
 *     comments are reparented; pendingFirmInvites on the mirror are
 *     dropped (they're stale by the time the mirror exists since
 *     the engagement is already ACCEPTED).
 *   - The mirror is deleted last. Its FirmEngagement rows pointing
 *     at the same agency Job are dropped since the canonical
 *     already has them.
 *
 * Idempotent — once every client has at most one ClientJob per
 * underlying agency Job, subsequent boots cost a single findMany.
 */

import { prisma } from "../prisma";

export interface MigrationStats {
  duplicatesFound: number;
  duplicatesMerged: number;
  membersMoved: number;
  commentsMoved: number;
  pendingInvitesDropped: number;
  durationMs: number;
  skipped?: boolean;
}

export async function runMergeDuplicateClientJobs(): Promise<MigrationStats> {
  const started = Date.now();

  // Every mirror ClientJob (sourceJobId set) is a candidate for
  // merging — by definition it points at an agency Job, and we just
  // need to check whether ANOTHER ClientJob at the same client also
  // links to that same agency Job (via FirmEngagement).
  const mirrors = await prisma.clientJob.findMany({
    where: { sourceJobId: { not: null } },
    select: { id: true, clientId: true, sourceJobId: true, createdAt: true },
  });

  if (mirrors.length === 0) {
    return {
      duplicatesFound: 0,
      duplicatesMerged: 0,
      membersMoved: 0,
      commentsMoved: 0,
      pendingInvitesDropped: 0,
      durationMs: Date.now() - started,
      skipped: true,
    };
  }

  const stats: MigrationStats = {
    duplicatesFound: 0,
    duplicatesMerged: 0,
    membersMoved: 0,
    commentsMoved: 0,
    pendingInvitesDropped: 0,
    durationMs: 0,
  };

  for (const mirror of mirrors) {
    if (!mirror.sourceJobId) continue;
    // Find the partner ClientJob at the same client whose
    // engagements include the same agency Job. Skip the mirror
    // itself.
    const partner = await prisma.clientJob.findFirst({
      where: {
        clientId: mirror.clientId,
        id: { not: mirror.id },
        engagements: { some: { jobId: mirror.sourceJobId } },
      },
      select: { id: true, createdAt: true, sourceJobId: true },
    });

    if (!partner) continue;
    stats.duplicatesFound += 1;

    // Pick canonical: prefer the client-posted original (no
    // sourceJobId). If both have one, pick the older row.
    const canonicalId =
      partner.sourceJobId === null
        ? partner.id
        : mirror.sourceJobId === null
          ? mirror.id
          : partner.createdAt <= mirror.createdAt
            ? partner.id
            : mirror.id;
    const removeId = canonicalId === mirror.id ? partner.id : mirror.id;

    await prisma.$transaction(async (tx) => {
      // 1) Members on the removed row that aren't already members on
      //    the canonical row get moved over. Unique (clientJobId,
      //    clientUserId) means we have to filter out collisions
      //    before reparenting.
      const removeMembers = await tx.clientJobMember.findMany({
        where: { clientJobId: removeId },
        select: { clientUserId: true },
      });
      const canonicalMembers = await tx.clientJobMember.findMany({
        where: { clientJobId: canonicalId },
        select: { clientUserId: true },
      });
      const existing = new Set(canonicalMembers.map((m) => m.clientUserId));
      const toMove = removeMembers.filter((m) => !existing.has(m.clientUserId));
      if (toMove.length > 0) {
        await tx.clientJobMember.createMany({
          data: toMove.map((m) => ({
            clientJobId: canonicalId,
            clientUserId: m.clientUserId,
          })),
          skipDuplicates: true,
        });
        stats.membersMoved += toMove.length;
      }
      // Drop the removed row's members so the cascade-delete is
      // clean (avoids race with the canonical-side unique index).
      await tx.clientJobMember.deleteMany({ where: { clientJobId: removeId } });

      // 2) Comments reparent. There's no per-comment uniqueness so
      //    a straight update is safe.
      const commentMove = await tx.comment.updateMany({
        where: { clientJobId: removeId },
        data: { clientJobId: canonicalId },
      });
      stats.commentsMoved += commentMove.count;

      // 3) Pending firm invites on the removed row are stale (the
      //    engagement that created the mirror is already ACCEPTED).
      const pendingDrop = await tx.pendingFirmInvite.deleteMany({
        where: { clientJobId: removeId },
      });
      stats.pendingInvitesDropped += pendingDrop.count;

      // 4) FirmEngagement rows on the removed row pointing at the
      //    same agency Job are redundant — the canonical already
      //    carries them (that's the dedup signal). For safety we
      //    re-check before deleting in case the mirror had an
      //    engagement to a DIFFERENT agency Job (rare).
      await tx.firmEngagement.deleteMany({
        where: {
          clientJobId: removeId,
          jobId: mirror.sourceJobId,
        },
      });

      // 5) Finally drop the duplicate ClientJob. Schema cascade
      //    handles anything else (documents, etc).
      await tx.clientJob.delete({ where: { id: removeId } });
    });

    stats.duplicatesMerged += 1;
  }

  stats.durationMs = Date.now() - started;
  return stats;
}
