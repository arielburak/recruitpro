import * as Sentry from "@sentry/nextjs";

/**
 * Runs once per Next.js server instance boot. We use it to:
 *   1. Initialize Sentry on the active runtime (node or edge).
 *   2. Auto-apply the one-shot "canonical 9-stage pipeline" migration
 *      so staging/production don't need anyone to SSH in and run a
 *      script after deploy.
 *
 * runStageMigration() has a fast-path check (no legacy stage names + every
 * tenant has exactly 9 stages) so once the migration succeeds on a given
 * database, every subsequent cold start pays only two count() queries.
 */
export async function register() {
  // Sentry init is runtime-specific — the Edge SDK has a smaller surface
  // than the Node SDK, so we import the right config based on the
  // active runtime. Both files no-op cleanly when SENTRY_DSN is unset.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  // Skip on edge runtime — Prisma + Neon adapter only runs on the Node
  // runtime, and the migrations don't need to run twice.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { runStageMigration } = await import("./lib/migrations/stages");
    const stats = await runStageMigration();
    if (stats.skipped) {
      console.log("[stages-migration] already migrated, skipped");
    } else {
      console.log(
        `[stages-migration] jobs ${stats.jobsNormalized}/${stats.jobsTotal} ` +
          `clients ${stats.clientsNormalized}/${stats.clientsTotal} ` +
          `+${stats.stagesCreated}/-${stats.stagesDeleted} stages ` +
          `${stats.submissionsMoved} submissions moved ` +
          `in ${stats.durationMs}ms`
      );
    }
  } catch (err) {
    // Don't block server startup on a migration failure — log and move on.
    // Operator can rerun via `ts-node scripts/migrate-stages-to-canonical.ts`.
    console.error("[stages-migration] failed:", err);
  }

  // One-shot: grandfather every pre-cutoff org into "free forever" so
  // all current test accounts stay unlocked. Idempotent — after the
  // first successful run this is a ~0-row updateMany.
  try {
    const { grandfatherExistingOrgs } = await import("./lib/migrations/grandfather-orgs");
    const stats = await grandfatherExistingOrgs();
    if (stats.comped > 0) {
      console.log(
        `[grandfather-orgs] comped ${stats.comped} pre-${stats.cutoff} subscriptions in ${stats.durationMs}ms`
      );
    }
  } catch (err) {
    console.error("[grandfather-orgs] failed:", err);
  }

  // One-shot: seed an explicit ClientJobMember row on any ClientJob
  // that had none. Removed legacy-open semantics on the client-portal
  // access helper — without this backfill, historical rows would
  // silently turn invisible to every team member.
  try {
    const { runClientJobMemberBackfill } = await import(
      "./lib/migrations/client-job-members"
    );
    const stats = await runClientJobMemberBackfill();
    if (!stats.skipped) {
      console.log(
        `[client-job-members] seeded ${stats.seeded}/${stats.scanned} orphan jobs in ${stats.durationMs}ms`
      );
    }
  } catch (err) {
    console.error("[client-job-members] failed:", err);
  }

  // One-shot: align clientStageId with "Placed" for every submission
  // that's already been placed on the agency side. Forward path was
  // fixed in PR #251 (POST /api/placements now mirrors the stage);
  // this catches existing rows where the mirror never ran.
  try {
    const { runPlacedClientStageBackfill } = await import(
      "./lib/migrations/placed-client-stage"
    );
    const stats = await runPlacedClientStageBackfill();
    if (!stats.skipped) {
      console.log(
        `[placed-client-stage] aligned ${stats.updated}/${stats.scanned} placed submissions in ${stats.durationMs}ms`
      );
    }
  } catch (err) {
    console.error("[placed-client-stage] failed:", err);
  }

  // One-shot: merge duplicate ClientJob rows that point at the same
  // underlying agency Job (client posted FIRST + agency later ran
  // "Invite Client" against the same engagement). PR #254 added the
  // forward-path dedup; this cleans up pre-fix rows.
  try {
    const { runMergeDuplicateClientJobs } = await import(
      "./lib/migrations/merge-duplicate-client-jobs"
    );
    const stats = await runMergeDuplicateClientJobs();
    if (!stats.skipped) {
      console.log(
        `[merge-client-jobs] merged ${stats.duplicatesMerged}/${stats.duplicatesFound} duplicate pairs ` +
          `(${stats.membersMoved} members, ${stats.commentsMoved} comments, ${stats.pendingInvitesDropped} pending invites) ` +
          `in ${stats.durationMs}ms`
      );
    }
  } catch (err) {
    console.error("[merge-client-jobs] failed:", err);
  }
}

// Forward Next.js server errors (Server Components, Route Handlers,
// Server Actions, Proxy) into Sentry. Without this we'd only catch
// what Next surfaces to the client error boundary, not the original
// stack on the server. See Next 16 docs: instrumentation.md.
export const onRequestError = Sentry.captureRequestError;
