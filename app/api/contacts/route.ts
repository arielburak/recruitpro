import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const clientId = request.nextUrl.searchParams.get("clientId");

    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(clientId ? { clientId } : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: { lastName: "asc" },
    });

    // Enrich with portal status: for each contact with an email, look
    // up the matching ClientUser at the same client. Lets the client
    // detail page's Contacts table show "Invite" / "In portal" /
    // "Pending" inline without a second round-trip per row.
    const lookups = contacts
      .filter((c) => c.email)
      .map((c) => ({ clientId: c.clientId, email: c.email!.toLowerCase() }));
    const portalUsers =
      lookups.length > 0
        ? await prisma.clientUser.findMany({
            where: {
              OR: lookups.map((l) => ({
                clientId: l.clientId,
                email: { equals: l.email, mode: "insensitive" as const },
              })),
            },
            select: {
              id: true,
              email: true,
              clientId: true,
              isActive: true,
              passwordHash: true,
              role: true,
            },
          })
        : [];

    const enriched = contacts.map((c) => {
      if (!c.email) {
        return { ...c, portalStatus: "none" as const, portalRole: null };
      }
      const match = portalUsers.find(
        (pu) =>
          pu.clientId === c.clientId &&
          pu.email.toLowerCase() === c.email!.toLowerCase(),
      );
      // Status semantics mirror /api/contacts/all so the badge + Invite
      // button surface consistently across surfaces. "pending" = the
      // ClientUser row exists but the password hasn't been set yet
      // (the recruiter invited and the contact hasn't clicked the
      // set-password link).
      let portalStatus: "active" | "pending" | "none" = "none";
      if (match) {
        portalStatus = match.passwordHash && match.isActive ? "active" : "pending";
      }
      return {
        ...c,
        portalStatus,
        portalRole: match?.role || null,
      };
    });

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const { firstName, lastName, title, email, phone, linkedIn, isPrimary, notes, clientId } = body;

    if (!firstName || !lastName || !clientId) {
      return NextResponse.json(
        { error: "firstName, lastName, and clientId are required" },
        { status: 400 }
      );
    }

    // Validate clientId belongs to org
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const contact = await prisma.contact.create({
      data: {
        firstName,
        lastName,
        title,
        email,
        phone,
        linkedIn,
        isPrimary: isPrimary ?? false,
        notes,
        clientId,
        organizationId: ctx.organizationId,
      },
    });

    await logActivity({
      action: "CONTACT_CREATED",
      description: `Created contact ${firstName} ${lastName} for ${client.name}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
