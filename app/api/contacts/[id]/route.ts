import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";

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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
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

    const refreshed = await prisma.contact.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { firstName: true, lastName: true, client: { select: { name: true } } },
    });
    const contactName = refreshed
      ? `${refreshed.firstName} ${refreshed.lastName}`.trim()
      : "";
    const label = refreshed?.client?.name
      ? `${contactName} (${refreshed.client.name})`
      : contactName || id;

    await logActivity({
      action: "CONTACT_UPDATED",
      description: `Updated contact ${label}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    const existing = await prisma.contact.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { firstName: true, lastName: true, client: { select: { name: true } } },
    });

    const deleted = await prisma.contact.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });

    if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const contactName = existing
      ? `${existing.firstName} ${existing.lastName}`.trim()
      : "";
    const label = existing?.client?.name
      ? `${contactName} (${existing.client.name})`
      : contactName || id;

    await logActivity({
      action: "CONTACT_DELETED",
      description: `Deleted contact ${label}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
