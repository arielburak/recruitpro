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

    return NextResponse.json(contacts);
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
