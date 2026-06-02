import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function GET(request: Request) {
  try {
    const ctx = await getOrgContext();
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const includeClients = url.searchParams.get("includeClients") === "true";

    // Search team members. When `q` is empty we hand back the full
    // active roster (capped at a sane upper bound) so client-side
    // filtered pickers like SearchableSelect can resolve any member
    // without paginating; when `q` is set we cap tightly because the
    // caller is doing a typeahead.
    const users = await prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        name: { contains: q, mode: "insensitive" },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: q ? 25 : 200,
    });

    let clients: any[] = [];
    if (includeClients) {
      // Search client contacts
      clients = await prisma.clientUser.findMany({
        where: {
          client: { engagedOrganizations: { some: { organizationId: ctx.organizationId } } },
          name: { contains: q, mode: "insensitive" },
          isActive: true,
        },
        select: { id: true, name: true, email: true, client: { select: { name: true } } },
        take: 10,
      });
    }

    return NextResponse.json({
      users: users.map((u) => ({ ...u, type: "user" })),
      clients: clients.map((c) => ({ ...c, type: "client", companyName: c.client?.name })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
