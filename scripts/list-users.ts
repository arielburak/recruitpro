/* eslint-disable no-console */
// Quick read-only script to list recent users for QA.
//   npx tsx scripts/list-users.ts

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

// Import prisma AFTER env is loaded — otherwise the static import
// gets hoisted above config() and DATABASE_URL is still undefined
// when the client is constructed.
async function main() {
  const { prisma } = await import("../lib/prisma");
  const users = await prisma.user.findMany({
    select: {
      email: true,
      name: true,
      emailVerifiedAt: true,
      createdAt: true,
      organization: { select: { name: true, needsOnboarding: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
