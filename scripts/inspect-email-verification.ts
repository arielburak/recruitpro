/* eslint-disable no-console */
// Quick inspection: pull every row matching an email and dump the
// verification-relevant fields so we can debug "I never got the
// verification mail" reports.
//
// Usage:
//   npx tsx scripts/inspect-email-verification.ts user@example.com
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/inspect-email-verification.ts <email>");
    process.exit(1);
  }

  const u = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, name: true,
      emailVerifiedAt: true, emailVerificationToken: true,
      emailVerificationExpiresAt: true, createdAt: true,
    },
  });
  console.log("Agency User:", u);

  const cu = await prisma.clientUser.findUnique({
    where: { email },
    select: {
      id: true, email: true, name: true, isActive: true,
      emailVerifiedAt: true, emailVerificationToken: true,
      emailVerificationExpiresAt: true, createdAt: true,
    },
  });
  console.log("ClientUser:", cu);

  console.log("\nEnv hints:");
  console.log("  RESEND_API_KEY  set?", !!process.env.RESEND_API_KEY);
  console.log("  EMAIL_FROM      :", process.env.EMAIL_FROM || "(not set)");
  console.log("  NEXTAUTH_URL    :", process.env.NEXTAUTH_URL || "(not set)");

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
