import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Returns a UNIFIED list of all contacts related to this organization.
//
// A "person" can show up in two places:
//   - Contact[]    — explicit per-client contacts the recruiter manages.
//   - ClientUser[] — those that can actually log in to the Client Portal.
//
// We MERGE both sources by (clientId, email) into a single row instead of
// showing the same person twice (or — worse — only as a Contact, hiding the
// fact that they have portal access). The row carries two independent flags:
//   isContact         — present in the Contact table
//   hasPortalAccess   — has an active ClientUser for the same client
// The UI renders one badge per flag, so portal access is always visible
// even when the person was first added as a regular Contact.
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
      isContact: boolean;
      hasPortalAccess: boolean;
      portalRole: string | null;
      firstName: string;
      lastName: string;
      name: string;
      title: string | null;
      email: string | null;
      phone: string | null;
      isPrimary: boolean;
      clientId: string;
      clientName: string;
      createdAt: string;
    };

    const byKey = new Map<string, UnifiedContact>();

    const makeKey = (clientId: string, email: string | null | undefined, name: string) =>
      `${clientId}::${(email || name).trim().toLowerCase()}`;

    // 1. Contact[] table — recruiter-curated source of truth for fields
    //    (title, phone, primary flag).
    for (const c of contacts) {
      const k = makeKey(c.client.id, c.email, `${c.firstName} ${c.lastName}`);
      byKey.set(k, {
        id: `contact_${c.id}`,
        isContact: true,
        hasPortalAccess: false,
        portalRole: null,
        firstName: c.firstName,
        lastName: c.lastName,
        name: `${c.firstName} ${c.lastName}`.trim(),
        title: c.title,
        email: c.email,
        phone: c.phone,
        isPrimary: c.isPrimary,
        clientId: c.client.id,
        clientName: c.client.name,
        createdAt: c.createdAt.toISOString(),
      });
    }

    // 2. ClientUser[] — merge into the existing row if we already saw this
    //    person as a Contact, otherwise add a new portal-only row.
    for (const client of clients) {
      for (const u of client.clientUsers) {
        const k = makeKey(client.id, u.email, u.name);
        const existing = byKey.get(k);
        if (existing) {
          existing.hasPortalAccess = true;
          existing.portalRole = u.role;
          // Backfill missing fields from the ClientUser so we don't lose
          // information when the Contact was added with sparse data.
          if (!existing.title && u.title) existing.title = u.title;
          if (!existing.email && u.email) existing.email = u.email;
          continue;
        }
        const [firstName, ...rest] = (u.name || "").trim().split(" ");
        const lastName = rest.join(" ");
        byKey.set(k, {
          id: `portal_${u.id}`,
          isContact: false,
          hasPortalAccess: true,
          portalRole: u.role,
          firstName: firstName || u.name,
          lastName: lastName || "",
          name: u.name,
          title: u.title || null,
          email: u.email,
          phone: null,
          isPrimary: false,
          clientId: client.id,
          clientName: client.name,
          createdAt: new Date(0).toISOString(),
        });
      }
    }

    const all = Array.from(byKey.values());

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
