import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { prisma } from "./prisma";

// Agency-side request context. Always sources the user's identity,
// organization, and role from the database — not from the JWT.
//
// Why DB-fresh: the JWT is set at login and isn't refreshed on every
// request. If anything in the user's profile changes server-side
// (role flip, organization migration, a User row deleted + recreated
// with the same address), the JWT would lag and queries would filter
// by the old values. That broke /engagements + Google Calendar
// connect after the comp-access run — the JWT had stale org context
// and self-scoped queries came up empty. Reading DB on every request
// is cheap (one indexed PK lookup) and lets the session self-heal.
//
// Lookup strategy:
//   1. by id (fast path — JWT.id is usually still valid)
//   2. fallback by email (covers user deleted + recreated with same
//      address, which gives them a new id but the same login identity)
export async function getOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id && !session?.user?.email) {
    throw new Error("Unauthorized: No session");
  }
  const sessionId = session.user.id as string | undefined;
  const sessionEmail = session.user.email as string | undefined;

  const dbUser =
    (sessionId
      ? await prisma.user.findUnique({
          where: { id: sessionId },
          select: { id: true, role: true, organizationId: true, name: true, email: true, isActive: true },
        })
      : null) ||
    (sessionEmail
      ? await prisma.user.findUnique({
          where: { email: sessionEmail },
          select: { id: true, role: true, organizationId: true, name: true, email: true, isActive: true },
        })
      : null);

  if (!dbUser || !dbUser.isActive) {
    throw new Error("Unauthorized: User not found or inactive");
  }
  return {
    userId: dbUser.id,
    organizationId: dbUser.organizationId,
    role: (dbUser.role || "USER") as "ADMIN" | "USER",
    userName: dbUser.name || "",
    userEmail: dbUser.email || "",
  };
}

export async function getClientContext() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  // One email → one ClientUser (DB-enforced via `email @unique`).
  // Look up by email so role / clientId / clientName stay fresh even if
  // the JWT cache is stale after a recent edit.
  let clientUser: { id: string; clientId: string; role: "ADMIN" | "USER"; name: string; email: string; client: { name: string } } | null = null;
  if (user?.email) {
    const cu = await prisma.clientUser.findFirst({
      where: { email: { equals: user.email, mode: "insensitive" }, isActive: true },
      select: {
        id: true,
        clientId: true,
        role: true,
        name: true,
        email: true,
        client: { select: { name: true } },
      },
    });
    if (cu) clientUser = cu as any;
  }

  if (!clientUser) {
    throw new Error("Unauthorized: Not a client user");
  }

  return {
    clientUserId: clientUser.id,
    clientId: clientUser.clientId,
    clientName: clientUser.client.name || "",
    role: clientUser.role as "ADMIN" | "USER",
    userName: clientUser.name,
    userEmail: clientUser.email,
  };
}
