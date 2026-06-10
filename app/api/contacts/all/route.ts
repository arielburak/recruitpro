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

    // contacts: agency-side rows in this firm's book.
    // agencyClients: the agency-side Client rows for those contacts —
    //   used purely to map (name → agency-side id) when re-keying
    //   matched ClientUsers below.
    // Subtle bug we just fixed (2026-06-10): a Contact's `clientId`
    // and a ClientUser's `clientId` are NOT the same id space — the
    // agency-side Client is a mirror created at engagement accept,
    // ClientUsers live at the original client-portal-side Client.
    // They share `name`, not id. We therefore match across by name +
    // email and re-key matches back to the agency-side id so the
    // existing `makeKey` join still works.
    const [contacts, agencyClients] = await Promise.all([
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
        select: { id: true, name: true },
      }),
    ]);

    // Pull ClientUsers at any client-portal-side Client whose name
    // matches one of the agency-side Clients we're enriching. The
    // `client` include lets us re-key by name back to the agency-side
    // id below.
    const agencyNames = agencyClients.map((c) => c.name);
    const portalUsers =
      agencyNames.length > 0
        ? await prisma.clientUser.findMany({
            where: {
              isActive: true,
              client: {
                name: { in: agencyNames, mode: "insensitive" as const },
              },
            },
            select: {
              id: true,
              name: true,
              email: true,
              title: true,
              role: true,
              passwordHash: true,
              emailVerifiedAt: true,
              client: { select: { name: true } },
            },
          })
        : [];

    // Stitch ClientUsers back to their agency-side mirror by name so
    // the rest of the enrichment loop can use the same agency-side id
    // the contacts already carry.
    const agencyIdByName = new Map<string, string>();
    for (const ac of agencyClients) {
      agencyIdByName.set(ac.name.toLowerCase(), ac.id);
    }
    const clients = agencyClients.map((ac) => ({
      id: ac.id,
      name: ac.name,
      clientUsers: portalUsers.filter(
        (u) => u.client.name.toLowerCase() === ac.name.toLowerCase(),
      ),
    }));

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
