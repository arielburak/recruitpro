/**
 * One-shot CLI wrapper around runStageMigration(). The real logic lives in
 * lib/migrations/stages.ts so the same code runs via instrumentation.ts on
 * server boot and via this script when an operator runs it by hand.
 */
import { prisma } from "../lib/prisma";
import { runStageMigration } from "../lib/migrations/stages";

async function main() {
  console.log("Migrating all tenants to the canonical 9-stage pipeline...");
  const stats = await runStageMigration();
  if (stats.skipped) {
    console.log("Already fully migrated, nothing to do.");
  } else {
    console.log(
      `Jobs normalized: ${stats.jobsNormalized}/${stats.jobsTotal} | ` +
      `Clients normalized: ${stats.clientsNormalized}/${stats.clientsTotal} | ` +
      `stages +${stats.stagesCreated}/-${stats.stagesDeleted} | ` +
      `submissions moved: ${stats.submissionsMoved} | ` +
      `${stats.durationMs}ms`
    );
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
