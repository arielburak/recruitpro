import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function GET() {
  try {
    const ctx = await getOrgContext();

    const deals = await prisma.deal.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        client: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(deals);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const { title, value, probability, stage, expectedClose, notes, clientId, contactId, ownerId } = body;

    if (!title || !clientId) {
      return NextResponse.json(
        { error: "title and clientId are required" },
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

    // Validate contactId if provided
    if (contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, organizationId: ctx.organizationId },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
    }

    const deal = await prisma.deal.create({
      data: {
        title,
        value,
        probability,
        stage,
        expectedClose: expectedClose ? new Date(expectedClose) : undefined,
        notes,
        clientId,
        contactId,
        ownerId: ownerId || ctx.userId,
        organizationId: ctx.organizationId,
      },
    });

    await logActivity({
      action: "DEAL_CREATED",
      description: `Created deal "${title}" for ${client.name}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
