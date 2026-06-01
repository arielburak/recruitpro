/**
 * Runs once per Next.js server instance boot. We use it to auto-apply the
 * one-shot "canonical 9-stage pipeline" migration so staging/production
 * don't need anyone to SSH in and run a script after deploy.
 *
 * runStageMigration() has a fast-path check (no legacy stage names + every
 * tenant has exactly 9 stages) so once the migration succeeds on a given
 * database, every subsequent cold start pays only two count() queries.
 */
export async function register() {
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
}
