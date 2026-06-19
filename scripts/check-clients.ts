import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.clientUser.findMany({
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("=== ClientUsers ===");
  for (const u of users) {
    console.log(`${u.name} | ${u.email} | clientId=${u.clientId} | ${u.client.name} | active=${u.isActive} | ${u.passwordHash ? "HAS_PWD" : "NO_PWD"} | title=${u.title || "none"}`);
  }

  const jobs = await prisma.clientJob.findMany({
    select: { title: true, clientId: true, status: true, postedById: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log("\n=== ClientJobs ===");
  for (const j of jobs) {
    console.log(`${j.title} | clientId=${j.clientId} | ${j.status} | postedBy=${j.postedById}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
