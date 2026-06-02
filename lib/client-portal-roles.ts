// Enforces the "every Client always has at least one active ADMIN"
// invariant on the client portal side.
//
// Why this exists: invites historically required an ADMIN to grant
// the ADMIN role on a new member. A Client could end up with USERS
// but zero ADMINs (the only admin gets removed, or a USER was
// onboarded first and the original admin lost access), creating a
// permanent dead-end — nobody on the team can promote anyone, so
// member management is frozen forever.
//
// Two complementary entry points:
//
//   * `roleForNewClientUser(prisma, clientId, requestedRole)` is
//     called from every endpoint that creates a ClientUser. If the
//     client currently has zero ADMINs (which includes the
//     "creating the very first user" case), we force ADMIN — so
//     the team always boots with a clear owner.
//
//   * `ensureClientHasActiveAdmin(prisma, clientId)` is called on
//     read paths (typically /api/profile) so legacy data that
//     somehow ended up admin-less self-heals on the next visit.
//     It picks the oldest still-active user and promotes them.

type AnyPrisma = any;

export async function roleForNewClientUser(
  prisma: AnyPrisma,
  clientId: string,
  requested: "USER" | "ADMIN",
): Promise<"USER" | "ADMIN"> {
  const admins = await prisma.clientUser.count({
    where: { clientId, isActive: true, role: "ADMIN" },
  });
  // Force ADMIN if the team currently has no admin. Covers two cases:
  //   1. First active user at the client (admins = 0 because no
  //      users yet).
  //   2. Existing team without an admin (legacy, dead-end client).
  if (admins === 0) return "ADMIN";
  return requested;
}

// Promote the oldest active user to ADMIN if none exist. Returns the
// freshly-promoted user's id (or null if no action was needed / no
// active users at all).
export async function ensureClientHasActiveAdmin(
  prisma: AnyPrisma,
  clientId: string,
): Promise<string | null> {
  const admins = await prisma.clientUser.count({
    where: { clientId, isActive: true, role: "ADMIN" },
  });
  if (admins > 0) return null;

  const oldest = await prisma.clientUser.findFirst({
    where: { clientId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!oldest) return null;

  await prisma.clientUser.update({
    where: { id: oldest.id },
    data: { role: "ADMIN" },
  });
  return oldest.id;
}
