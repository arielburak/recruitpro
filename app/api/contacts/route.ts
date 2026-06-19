import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import { logActivity } from "@/lib/activity";
import { safeErrorMessage } from "@/lib/safe-error";

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

    // Enrich with portal status. Subtle: the contact's `clientId`
    // points at the AGENCY-side Client row (a mirror created when the
    // firm accepted the engagement). ClientUsers live at the
    // CLIENT-PORTAL-side Client row, which has the same name but a
    // different id. Matching by (contact.clientId == clientUser.clientId)
    // therefore always misses — that's the bug the user hit when Nick
    // (who literally invited the firm) showed up with an "Invite"
    // button. We match by (name, email) instead, which is what
    // actually ties the two Client rows together (the accept handler
    // mirrors `client.name` 1:1).
    const lookups = contacts
      .filter((c) => c.email && c.client?.name)
      .map((c) => ({
        clientName: c.client!.name,
        email: c.email!.toLowerCase(),
      }));
    const portalUsers =
      lookups.length > 0
        ? await prisma.clientUser.findMany({
            where: {
              OR: lookups.map((l) => ({
                email: { equals: l.email, mode: "insensitive" as const },
                client: {
                  name: { equals: l.clientName, mode: "insensitive" as const },
                },
              })),
            },
            select: {
              id: true,
              email: true,
              clientId: true,
              isActive: true,
              passwordHash: true,
              role: true,
              client: { select: { name: true } },
            },
          })
        : [];

    const enriched = contacts.map((c) => {
      if (!c.email) {
        return { ...c, portalStatus: "none" as const, portalRole: null };
      }
      const match = portalUsers.find(
        (pu) =>
          pu.client.name.toLowerCase() === (c.client?.name || "").toLowerCase() &&
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContextWithActiveSub();
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
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
