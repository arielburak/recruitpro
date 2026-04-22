import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Returns a UNIFIED list of all contacts related to this organization:
//   - Contact[] table (explicit per-client contacts)
//   - ClientUser[] (client portal users — colleagues of the hiring company)
// Deduplicated by email within the same client.
//
// The legacy "Main Contact" inline fields on Client (contactName/Email/Phone)
// are no longer surfaced — that concept has been retired in favor of the
// Contact[] table with isPrimary marking the main point of contact.
export async function GET() {
  try {
    const ctx = await getOrgContext();

    const [contacts, clients] = await Promise.all([
      prisma.contact.findMany({
        where: { organizationId: ctx.organizationId },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { lastName: "asc" },
      }),
      prisma.client.findMany({
        where: { organizationId: ctx.organizationId },
        select: {
          id: true,
          name: true,
          clientUsers: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              email: true,
              title: true,
              role: true,
            },
          },
        },
      }),
    ]);

    type UnifiedContact = {
      id: string;
      source: "contact" | "portal_user";
      firstName: string;
      lastName: string;
      name: string;
      title: string | null;
      email: string | null;
      phone: string | null;
      isPrimary: boolean;
      portalRole: string | null;
      clientId: string;
      clientName: string;
    };

    const all: UnifiedContact[] = [];
    const seenKeys = new Set<string>();

    const makeKey = (clientId: string, email: string | null | undefined, name: string) =>
      `${clientId}::${(email || name).trim().toLowerCase()}`;

    // 1. Contact[] table — source of truth
    for (const c of contacts) {
      const k = makeKey(c.client.id, c.email, `${c.firstName} ${c.lastName}`);
      seenKeys.add(k);
      all.push({
        id: `contact_${c.id}`,
        source: "contact",
        firstName: c.firstName,
        lastName: c.lastName,
        name: `${c.firstName} ${c.lastName}`.trim(),
        title: c.title,
        email: c.email,
        phone: c.phone,
        isPrimary: c.isPrimary,
        portalRole: null,
        clientId: c.client.id,
        clientName: c.client.name,
      });
    }

    // 2. ClientUser[] — colleagues of the hiring company who have portal access
    for (const client of clients) {
      for (const u of client.clientUsers) {
        const [firstName, ...rest] = (u.name || "").trim().split(" ");
        const lastName = rest.join(" ");
        const k = makeKey(client.id, u.email, u.name);
        if (seenKeys.has(k)) continue;
        seenKeys.add(k);
        all.push({
          id: `portal_${u.id}`,
          source: "portal_user",
          firstName: firstName || u.name,
          lastName: lastName || "",
          name: u.name,
          title: u.title || null,
          email: u.email,
          phone: null,
          isPrimary: false,
          portalRole: u.role,
          clientId: client.id,
          clientName: client.name,
        });
      }
    }

    // Sort alphabetically by last name, then first name
    all.sort((a, b) => {
      const lastCmp = (a.lastName || "").localeCompare(b.lastName || "");
      if (lastCmp !== 0) return lastCmp;
      return (a.firstName || "").localeCompare(b.firstName || "");
    });

    return NextResponse.json(all);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
