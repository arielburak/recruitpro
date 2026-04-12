import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        client: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(deal);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const body = await request.json();

    const { title, value, probability, stage, expectedClose, notes, clientId, contactId, ownerId } = body;

    // Validate clientId if being changed
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: ctx.organizationId },
      });
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
    }

    // Validate contactId if being changed
    if (contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, organizationId: ctx.organizationId },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
    }

    const updated = await prisma.deal.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...(title !== undefined && { title }),
        ...(value !== undefined && { value }),
        ...(probability !== undefined && { probability }),
        ...(stage !== undefined && { stage }),
        ...(expectedClose !== undefined && { expectedClose: expectedClose ? new Date(expectedClose) : null }),
        ...(notes !== undefined && { notes }),
        ...(clientId !== undefined && { clientId }),
        ...(contactId !== undefined && { contactId }),
        ...(ownerId !== undefined && { ownerId }),
      },
    });

    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await logActivity({
      action: "DEAL_UPDATED",
      description: `Updated deal ${id}${stage ? ` - stage changed to ${stage}` : ""}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const deleted = await prisma.deal.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });

    if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await logActivity({
      action: "DEAL_DELETED",
      description: `Deleted deal ${id}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
