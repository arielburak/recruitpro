// Seed para testing Test 2 (trial expired, sin tarjeta):
// Crea Organization + User admin + Subscription TRIALING con trialEndsAt
// backdateado a ayer (sin tarjeta, sin Stripe sub). Login con las creds
// generadas → ves directo el overlay full-screen rojo del SubscriptionGate.
//
// Uso:  npx tsx scripts/seed-trial-expired-test.ts
//
// Imprime email + password a stdout. Cleanup manual cuando termines:
//   DELETE FROM "Organization" WHERE name LIKE 'Trial Test Workspace%';

import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const ts = Date.now();
  const email = `trial-test-${ts}@alphabridgepartners.com`;
  const password = `TestPass-${ts}-Ok!`;
  const orgName = `Trial Test Workspace ${ts}`;
  const orgSlug = `trial-test-${ts}`;

  const passwordHash = await bcrypt.hash(password, 12);
  const trialExpired = new Date(Date.now() - 24 * 60 * 60 * 1000); // ayer

  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug: orgSlug,
      needsOnboarding: false,
      users: {
        create: {
          email,
          name: "Trial Test Admin",
          passwordHash,
          role: "ADMIN",
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      },
    },
    include: { users: true },
  });

  await prisma.subscription.create({
    data: {
      organizationId: org.id,
      stripeCustomerId: `pending_${ts}`,
      stripeSubscriptionId: null,
      status: "TRIALING",
      trialEndsAt: trialExpired,
      seats: 1,
    },
  });

  console.log("\n=== TRIAL EXPIRED TEST USER ===");
  console.log(`Org: ${orgName}`);
  console.log(`Org ID: ${org.id}`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Trial ended at: ${trialExpired.toISOString()}`);
  console.log("\nLogin en staging con email/password (NO Google OAuth).");
  console.log("Deberías ver overlay full-screen rojo 'Your free trial has ended'.");
  console.log("================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
