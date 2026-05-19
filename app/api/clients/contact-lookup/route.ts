import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Agency-side autocomplete for the "Invite Client to Portal" dialog on
// a Job page. When the recruiter starts typing, they should see hits
// like "Nick Cuello · Lion Point" — every ClientUser the agency already
// has on file (across all the agency's own Clients) gets matched.
//
// Scope: ClientUsers under THIS agency's Clients only. We never expose
// ClientUsers from another agency's Client records — that would leak
// the other firm's roster.
//
// Optional ?currentClientId is the Job's clientId; we use it just to
// tag whether each match is already on the same Client (so the UI can
// say "already a member" vs "invite over from Acme").
export async function GET(request: Request) {
  try {
    const ctx = await getOrgContext();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const currentClientId = (url.searchParams.get("currentClientId") || "").trim();

    if (q.length < 2) return NextResponse.json([]);

    const matches = await prisma.clientUser.findMany({
      where: {
        isActive: true,
        client: { organizationId: ctx.organizationId },
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        title: true,
        passwordHash: true,
        clientId: true,
        client: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }],
      take: 12,
    });

    return NextResponse.json(
      matches.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        title: m.title,
        clientId: m.clientId,
        clientName: m.client.name,
        hasPassword: !!m.passwordHash,
        onCurrentClient: currentClientId ? m.clientId === currentClientId : false,
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
