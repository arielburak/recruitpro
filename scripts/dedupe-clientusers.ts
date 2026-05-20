/* eslint-disable no-console */
// One-time dedupe before applying the `ClientUser.email @unique` schema
// change. Required because today the constraint is (email, clientId),
// meaning the same email can appear in multiple Client rows. The
// migration to a global unique constraint will fail unless every
// duplicate is resolved first.
//
// Strategy per duplicate group:
//   - Keep the row most likely to be "real": prefers active +
//     has-password, then most recently updated.
//   - Deactivate every other row (isActive=false) and tag the name
//     with [dedup'd] so they're easy to find for manual cleanup.
//     We do NOT delete rows because they may have submitted comments,
//     ratings, or notifications attached.
//
// Run:
//   npx tsx scripts/dedupe-clientusers.ts            # dry-run
//   npx tsx scripts/dedupe-clientusers.ts --apply    # actually mutate
//
// After --apply succeeds with zero remaining dupes, deploy the schema
// change and `prisma db push` will succeed.

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../lib/prisma");

  // Postgres groups case-insensitively here so "Alice@x.com" and
  // "alice@x.com" collapse into the same bucket — the new global
  // unique constraint is case-sensitive (Prisma default), but emails
  // are case-insensitive in practice and we want the dedupe to find
  // collisions across casing too.
  const groups: { email: string; n: bigint }[] = await prisma.$queryRawUnsafe(
    `SELECT lower(email) AS email, count(*) AS n
       FROM "ClientUser"
      GROUP BY lower(email)
     HAVING count(*) > 1
      ORDER BY count(*) DESC, lower(email)`
  );

  if (groups.length === 0) {
    console.log("✅ No duplicates. Safe to apply the schema change.");
    return;
  }

  console.log(`Found ${groups.length} duplicate email${groups.length === 1 ? "" : "s"}.`);
  console.log(apply ? "Applying changes…\n" : "Dry-run (pass --apply to actually mutate)\n");

  let kept = 0;
  let deactivated = 0;

  for (const g of groups) {
    const rows = await prisma.clientUser.findMany({
      where: { email: { equals: g.email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        passwordHash: true,
        clientId: true,
        client: { select: { name: true, organizationId: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    // Sort by "most likely real" — active beats inactive, password beats
    // no-password, recently updated beats stale. Within these tiers we
    // already pulled them in updatedAt desc order so ties resolve newest-first.
    const ranked = [...rows].sort((a, b) => {
      const score = (r: typeof a) =>
        (r.isActive ? 2 : 0) + (r.passwordHash ? 1 : 0);
      return score(b) - score(a);
    });

    const winner = ranked[0];
    const losers = ranked.slice(1);

    console.log(`\n${g.email}  (${rows.length} rows)`);
    console.log(`  ✓ keep   ${winner.id}  client="${winner.client.name}"  active=${winner.isActive}  pw=${!!winner.passwordHash}`);
    for (const l of losers) {
      console.log(`  ✗ retire ${l.id}  client="${l.client.name}"  active=${l.isActive}  pw=${!!l.passwordHash}`);
    }

    kept += 1;
    deactivated += losers.length;

    if (apply) {
      // Mutate each loser's email to a sentinel so the unique constraint
      // can be applied without deleting historical data. Tag the name so
      // a human reviewer can find them later. We don't delete because
      // ClientNotification, Comment, CandidateRating, and ClientJob rows
      // FK to clientUserId — cascading deletes would erase real history.
      for (const l of losers) {
        const sentinelEmail = `${l.email}+dedup-${l.id}@invalid.local`;
        await prisma.clientUser.update({
          where: { id: l.id },
          data: {
            email: sentinelEmail,
            isActive: false,
            name: l.name.startsWith("[dedup'd]") ? l.name : `[dedup'd] ${l.name}`,
          },
        });
      }
    }
  }

  console.log(`\nSummary: ${kept} winner${kept === 1 ? "" : "s"}, ${deactivated} retired.`);
  if (!apply) console.log("\nDry-run only. Re-run with --apply to mutate.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
