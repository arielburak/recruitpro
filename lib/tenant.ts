import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";

export async function getOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized: No organization context");
  }
  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    role: session.user.role as "ADMIN" | "RECRUITER",
    userName: session.user.name || "",
  };
}

export async function getClientContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.clientId || !session.user.isClientUser) {
    throw new Error("Unauthorized: Not a client user");
  }
  return {
    clientUserId: session.user.id,
    clientId: session.user.clientId,
    clientName: session.user.clientName || "",
  };
}
