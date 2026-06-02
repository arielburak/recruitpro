import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Agency-side autocomplete for the "Invite Client to Portal" dialog on
// a Job page. The mail-uniqueness rule (one email = one Client) means:
//   - matches at THIS Client → pickable (recruiter just re-invites
//     someone already on file);
//   - matches at ANOTHER Client → shown but disabled, with a clear
//     "in use at X" so the recruiter knows the email is taken and
//     they need a different one.
//
// Scope: ClientUsers under THIS agency's Clients only. Other agencies'
// rosters stay private.
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
        client: {
          engagedOrganizations: { some: { organizationId: ctx.organizationId } },
        },
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
      matches.map((m) => {
        const onCurrentClient = currentClientId
          ? m.clientId === currentClientId
          : false;
        return {
          id: m.id,
          email: m.email,
          name: m.name,
          title: m.title,
          clientId: m.clientId,
          clientName: m.client.name,
          hasPassword: !!m.passwordHash,
          onCurrentClient,
          // Picking a contact at a different Client would fail server-side
          // (the unique-email rule rejects cross-Client invites). Surface
          // that as `available: false` so the UI can disable the row and
          // explain why instead of letting the recruiter submit and get
          // a 409.
          available: onCurrentClient || !currentClientId,
        };
      })
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
