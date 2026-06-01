/**
 * One-shot CLI wrapper around runClientJobMemberBackfill(). The real
 * logic lives in lib/migrations/client-job-members.ts and also
 * auto-runs at server boot via instrumentation.ts. Use this script
 * when you need to seed orphan ClientJobs manually (e.g. during a
 * local audit before flipping the access helper to strict-only).
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { runClientJobMemberBackfill } = await import("../lib/migrations/client-job-members");

  console.log("Seeding ClientJobMember rows for legacy-open ClientJobs...");
  const stats = await runClientJobMemberBackfill();
  if (stats.skipped) {
    console.log("Every active ClientJob already has at least one member. Nothing to do.");
  } else {
    console.log(
      `Seeded ${stats.seeded} new member rows across ${stats.scanned} orphan ClientJob(s) in ${stats.durationMs}ms.`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
