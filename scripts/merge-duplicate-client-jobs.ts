/**
 * One-shot CLI wrapper around runMergeDuplicateClientJobs(). Real
 * logic lives in lib/migrations/merge-duplicate-client-jobs.ts and
 * auto-runs at server boot via instrumentation.ts.
 *
 * Run manually when you want to clean up a specific environment
 * without redeploying:
 *   npx tsx scripts/merge-duplicate-client-jobs.ts
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { runMergeDuplicateClientJobs } = await import(
    "../lib/migrations/merge-duplicate-client-jobs"
  );

  console.log("Merging duplicate ClientJob rows...");
  const stats = await runMergeDuplicateClientJobs();
  if (stats.skipped) {
    console.log("No mirror ClientJobs found. Nothing to do.");
  } else {
    console.log(
      `Found ${stats.duplicatesFound} duplicate pair(s). Merged ${stats.duplicatesMerged}. ` +
        `Moved ${stats.membersMoved} member(s), ${stats.commentsMoved} comment(s); ` +
        `dropped ${stats.pendingInvitesDropped} pending invite(s). ${stats.durationMs}ms.`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
