// Verifica el estado post-signup del launch test (read-only).
// npx tsx --env-file=.env scripts/verify-launch-signup.ts <email>
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: verify-launch-signup.ts <email>");

  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      emailVerifiedAt: true,
      passwordHash: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          needsOnboarding: true,
          subscription: {
            select: {
              status: true,
              trialEndsAt: true,
              seats: true,
              stripeCustomerId: true,
              stripeSubscriptionId: true,
              isComp: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    console.log("FAIL: user not found");
    process.exit(1);
  }

  const sub = user.organization.subscription;
  const now = Date.now();
  const trialMs = sub?.trialEndsAt ? sub.trialEndsAt.getTime() - now : 0;
  const trialDays = trialMs / (24 * 60 * 60 * 1000);

  const checks: Array<[string, boolean, string]> = [
    ["User created + ADMIN", user.role === "ADMIN", `role=${user.role}`],
    ["User isActive", user.isActive === true, `isActive=${user.isActive}`],
    ["Password hashed", !!user.passwordHash && user.passwordHash.length > 20, "hash present"],
    ["Org created", !!user.organization.name, user.organization.name],
    ["No onboarding needed (manual signup)", user.organization.needsOnboarding === false, `needsOnboarding=${user.organization.needsOnboarding}`],
    ["Subscription row exists", !!sub, sub ? "yes" : "MISSING"],
    ["Status TRIALING", sub?.status === "TRIALING", `status=${sub?.status}`],
    ["Trial ~7 days", trialDays > 6.9 && trialDays <= 7.05, `days=${trialDays.toFixed(2)}`],
    ["Seats = 1", sub?.seats === 1, `seats=${sub?.seats}`],
    ["No Stripe sub yet (no card)", sub?.stripeSubscriptionId === null, `subId=${sub?.stripeSubscriptionId}`],
    ["Not comp", sub?.isComp === false, `isComp=${sub?.isComp}`],
  ];

  let pass = 0;
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} | ${label} | ${detail}`);
    if (ok) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
