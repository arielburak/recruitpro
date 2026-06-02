/**
 * One-shot CLI wrapper around runPlacedClientStageBackfill(). Real
 * logic lives in lib/migrations/placed-client-stage.ts and auto-runs
 * at server boot via instrumentation.ts. Run manually when you want
 * to repair a specific environment without redeploying.
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { runPlacedClientStageBackfill } = await import(
    "../lib/migrations/placed-client-stage"
  );

  console.log("Aligning clientStageId for placed submissions...");
  const stats = await runPlacedClientStageBackfill();
  if (stats.skipped) {
    console.log("Every Placed submission already has clientStage = Placed. Nothing to do.");
  } else {
    console.log(
      `Updated ${stats.updated}/${stats.scanned} submissions in ${stats.durationMs}ms.`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
