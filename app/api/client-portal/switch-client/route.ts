import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { CLIENT_PORTAL_CLIENT_COOKIE } from "@/lib/client-portal-context";

// Persist a multi-membership portal user's "active" Client across
// requests. Stored in a cookie (not the JWT) so we don't need to
// trigger a NextAuth session.update on every switch. getClientContext
// reads this cookie to decide which ClientUser row to use.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = (session?.user?.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = await request.json();
    if (!clientId || typeof clientId !== "string") {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    // Make sure the caller actually has a ClientUser on the target
    // Client. Without this check the cookie would be honored by
    // getClientContext and effectively let them peek at any Client.
    const membership = await prisma.clientUser.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        clientId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of that client" }, { status: 403 });
    }

    const res = NextResponse.json({ success: true, clientId });
    res.cookies.set(CLIENT_PORTAL_CLIENT_COOKIE, clientId, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
