import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Unified contacts list — folds Contact[] (CRM rows the recruiter
// curated) and ClientUser[] (people who can actually sign in to the
// portal) into one stream so the UI never lies about who's where.
//
// portalStatus is the tri-state the UI actually cares about:
//   "none"    — no ClientUser exists for (clientId, email). Pure CRM.
//   "pending" — ClientUser exists but hasn't redeemed the set-password
//               invite yet. Shown with an amber badge + Resend.
//   "active"  — ClientUser has a passwordHash. They've logged in or
//               at least redeemed the invite and chosen a password.
//
// Optional ?clientId=… filter scopes the list to a single Client so
// the same merge logic powers the Client detail view without a
// duplicate endpoint.
export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const clientId = request.nextUrl.searchParams.get("clientId");

    const [contacts, clients] = await Promise.all([
      prisma.contact.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(clientId ? { clientId } : {}),
        },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { lastName: "asc" },
      }),
      prisma.client.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(clientId ? { id: clientId } : {}),
        },
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
              // passwordHash drives the pending vs active flip. We
              // never ship the hash itself — only the boolean.
              passwordHash: true,
              emailVerifiedAt: true,
            },
          },
        },
      }),
    ]);

    type PortalStatus = "none" | "pending" | "active";

    type UnifiedContact = {
      id: string;
      contactId: string | null;
      clientUserId: string | null;
      portalStatus: PortalStatus;
      portalRole: string | null;
      firstName: string;
      lastName: string;
      name: string;
      title: string | null;
      email: string | null;
      phone: string | null;
      clientId: string;
      clientName: string;
      createdAt: string;
    };

    const byKey = new Map<string, UnifiedContact>();
    const makeKey = (cid: string, email: string | null | undefined, name: string) =>
      `${cid}::${(email || name).trim().toLowerCase()}`;

    for (const c of contacts) {
      const k = makeKey(c.client.id, c.email, `${c.firstName} ${c.lastName}`);
      byKey.set(k, {
        id: `contact_${c.id}`,
        contactId: c.id,
        clientUserId: null,
        portalStatus: "none",
        portalRole: null,
        firstName: c.firstName,
        lastName: c.lastName,
        name: `${c.firstName} ${c.lastName}`.trim(),
        title: c.title,
        email: c.email,
        phone: c.phone,
        clientId: c.client.id,
        clientName: c.client.name,
        createdAt: c.createdAt.toISOString(),
      });
    }

    // Second pass: enrich existing Contact rows with their ClientUser
    // counterpart (so portal status + role light up in the row). We
    // deliberately DO NOT add a row for ClientUsers that have no
    // matching Contact — those are people the agency didn't add (self-
    // service portal signups, leftovers from earlier merges, etc.).
    // The Contacts view answers "who did we put on this client", not
    // "who can log in to this client's portal". The latter is what the
    // Client detail's portal-users surface is for.
    for (const client of clients) {
      for (const u of client.clientUsers) {
        const status: PortalStatus = u.passwordHash ? "active" : "pending";
        const k = makeKey(client.id, u.email, u.name);
        const existing = byKey.get(k);
        if (!existing) continue;
        existing.clientUserId = u.id;
        existing.portalStatus = status;
        existing.portalRole = u.role;
        if (!existing.title && u.title) existing.title = u.title;
        if (!existing.email && u.email) existing.email = u.email;
      }
    }

    const all = Array.from(byKey.values());
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
