// Reproduce lo que hace /settings/billing al cargar: llama a
// getSubscriptionStatus + simula lo que devuelve /api/admin/subscription
// GET para el user de prueba. Detecta si algún campo está null
// inesperado o si una query falla.
//
// npx tsx --env-file=.env scripts/debug-billing-page.ts

import { prisma } from "../lib/prisma";
import { getSubscriptionStatus } from "../lib/subscription-guard";

const TEST_EMAIL = "trial-test-1782392564793@alphabridgepartners.com";

async function main() {
  console.log(`\n=== DEBUG: ${TEST_EMAIL} ===\n`);

  const user = await prisma.user.findFirst({
    where: { email: TEST_EMAIL },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      organizationId: true,
      organization: { select: { name: true, needsOnboarding: true } },
    },
  });

  if (!user) {
    console.log("❌ User not found");
    return;
  }

  console.log("✓ User:", JSON.stringify(user, null, 2));

  // Reproduce lo que hace layout.tsx getSubscriptionStatus.
  console.log("\n--- getSubscriptionStatus ---");
  try {
    const subStatus = await getSubscriptionStatus(user.organizationId);
    console.log("✓ subStatus:", JSON.stringify(subStatus, null, 2));
  } catch (e: any) {
    console.log("❌ getSubscriptionStatus threw:", e?.message);
    console.log(e?.stack);
  }

  // Reproduce lo que hace /api/admin/subscription GET.
  console.log("\n--- prisma.subscription.findUnique ---");
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: user.organizationId },
    });
    console.log("✓ subscription:", JSON.stringify(subscription, null, 2));
  } catch (e: any) {
    console.log("❌ subscription query threw:", e?.message);
  }

  // Reproduce activeUsersList query.
  console.log("\n--- activeUsersList query ---");
  try {
    const activeUsersList = await prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    console.log("✓ activeUsersList:", JSON.stringify(activeUsersList, null, 2));
  } catch (e: any) {
    console.log("❌ activeUsersList query threw:", e?.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("MAIN ERROR:", e);
    process.exit(1);
  });
