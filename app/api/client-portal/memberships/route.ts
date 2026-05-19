import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { CLIENT_PORTAL_CLIENT_COOKIE } from "@/lib/client-portal-context";

// List every Client a logged-in portal user has access to. When a hiring
// contact's email is invited to multiple Clients (e.g. they work with
// Acme AND Lion Point and a recruiter shares with them under both),
// they get one ClientUser row per Client. This endpoint surfaces them
// so the header switcher can offer "Switch to Acme" / "Switch to Lion".
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const email = (session?.user?.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const memberships = await prisma.clientUser.findMany({
      where: {
        email: { equals: email, mode: "insensitive" },
        isActive: true,
      },
      select: {
        id: true,
        clientId: true,
        role: true,
        client: { select: { name: true, industry: true } },
      },
      orderBy: { client: { name: "asc" } },
    });

    const jar = await cookies();
    const selectedClientId = jar.get(CLIENT_PORTAL_CLIENT_COOKIE)?.value || null;

    return NextResponse.json({
      memberships: memberships.map((m) => ({
        clientUserId: m.id,
        clientId: m.clientId,
        clientName: m.client.name,
        industry: m.client.industry,
        role: m.role,
        isCurrent:
          selectedClientId === m.clientId ||
          (!selectedClientId && memberships[0]?.clientId === m.clientId),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
