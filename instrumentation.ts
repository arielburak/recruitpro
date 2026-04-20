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
  // runtime, and the migration doesn't need to run twice.
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
}
