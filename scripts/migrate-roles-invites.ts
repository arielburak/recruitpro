import { prisma } from "../lib/prisma";

async function main() {
  // Use raw SQL since the enum values aren't in the generated types anymore
  const result = await prisma.$executeRaw`
    UPDATE "UserInvite"
    SET "role" = 'USER'::"UserRole"
    WHERE "role"::text IN ('PARTNER', 'RECRUITER')
  `;
  console.log("UserInvites migrated:", result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
