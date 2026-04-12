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

    const contact = await prisma.contact.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(contact);
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

    const { firstName, lastName, title, email, phone, linkedIn, isPrimary, notes, clientId } = body;

    // If clientId is being changed, validate it belongs to org
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: ctx.organizationId },
      });
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
    }

    const updated = await prisma.contact.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(title !== undefined && { title }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(linkedIn !== undefined && { linkedIn }),
        ...(isPrimary !== undefined && { isPrimary }),
        ...(notes !== undefined && { notes }),
        ...(clientId !== undefined && { clientId }),
      },
    });

    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await logActivity({
      action: "CONTACT_UPDATED",
      description: `Updated contact ${id}`,
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

    const deleted = await prisma.contact.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });

    if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await logActivity({
      action: "CONTACT_DELETED",
      description: `Deleted contact ${id}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
