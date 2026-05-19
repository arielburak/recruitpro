import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { prisma } from "./prisma";

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
    const cu = await prisma.clientUser.findFirst({
      where: { email: { equals: user.email, mode: "insensitive" }, isActive: true },
      select: {
        id: true,
        clientId: true,
        role: true,
        name: true,
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
  };
}
