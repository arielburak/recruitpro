import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "./auth-options";
import { prisma } from "./prisma";
import { CLIENT_PORTAL_CLIENT_COOKIE } from "./client-portal-context";

export async function getOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized: No organization context");
  }
  // Fetch fresh role from DB to ensure permissions are accurate after role changes
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const role = (dbUser?.role || session.user.role || "USER") as "ADMIN" | "USER";
  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    role,
    userName: session.user.name || "",
  };
}

export async function getClientContext() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  // Always look up fresh role from DB to ensure permission checks are accurate.
  // The JWT may be stale after role changes.
  let clientUser: { id: string; clientId: string; role: "ADMIN" | "USER"; name: string; client: { name: string } } | null = null;

  if (user?.email) {
    // Honor the Client switcher cookie when present — the user may have
    // multiple ClientUser rows (one per Client) and the cookie tells us
    // which one they're "currently viewing". Validated server-side by
    // the (email, clientId) constraint, so a tampered cookie can't grant
    // access to a Client the user isn't a member of.
    const jar = await cookies();
    const selectedClientId = jar.get(CLIENT_PORTAL_CLIENT_COOKIE)?.value || null;

    const baseSelect = {
      id: true,
      clientId: true,
      role: true,
      name: true,
      client: { select: { name: true } },
    };

    let cu = null as any;
    if (selectedClientId) {
      cu = await prisma.clientUser.findFirst({
        where: {
          email: { equals: user.email, mode: "insensitive" },
          isActive: true,
          clientId: selectedClientId,
        },
        select: baseSelect,
      });
    }
    if (!cu) {
      // Fallback: first matching ClientUser (used by single-membership
      // users, and by multi-membership users who haven't switched yet).
      cu = await prisma.clientUser.findFirst({
        where: { email: { equals: user.email, mode: "insensitive" }, isActive: true },
        select: baseSelect,
      });
    }
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
  };
}
