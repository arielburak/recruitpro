import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { prisma } from "./prisma";

export async function getOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized: No organization context");
  }
  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    role: session.user.role as "ADMIN" | "PARTNER" | "RECRUITER",
    userName: session.user.name || "",
  };
}

export async function getClientContext() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  // Primary: session has clientId and isClientUser flag
  if (user?.clientId && user?.isClientUser) {
    return {
      clientUserId: user.id,
      clientId: user.clientId,
      clientName: user.clientName || "",
    };
  }

  // Fallback: look up ClientUser by email from session
  // This handles cases where the JWT doesn't have clientId set properly
  if (user?.email) {
    const clientUser = await prisma.clientUser.findFirst({
      where: { email: user.email, isActive: true },
      include: { client: { select: { name: true } } },
    });
    if (clientUser) {
      return {
        clientUserId: clientUser.id,
        clientId: clientUser.clientId,
        clientName: clientUser.client.name || "",
      };
    }
  }

  throw new Error("Unauthorized: Not a client user");
}
