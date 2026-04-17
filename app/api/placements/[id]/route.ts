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

    const placement = await prisma.placement.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        job: { select: { id: true, title: true, currency: true } },
        client: { select: { id: true, name: true } },
        submission: {
          select: {
            id: true,
            candidate: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            stage: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(placement);
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

    const { startDate, feeAmount, feePercentage, salary, invoiceStatus, guaranteePeriod, notes } = body;

    // Recalculate guarantee expiry if startDate or guaranteePeriod change
    let guaranteeExpiry: Date | undefined;
    if (startDate !== undefined || guaranteePeriod !== undefined) {
      // Need current placement to fill in missing values
      const current = await prisma.placement.findFirst({
        where: { id, organizationId: ctx.organizationId },
      });
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const sd = startDate ? new Date(startDate) : current.startDate;
      const gp = guaranteePeriod ?? current.guaranteePeriod ?? 90;
      if (sd) {
        guaranteeExpiry = new Date(sd);
        guaranteeExpiry.setDate(guaranteeExpiry.getDate() + gp);
      }
    }

    const updated = await prisma.placement.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(feeAmount !== undefined && { feeAmount }),
        ...(feePercentage !== undefined && { feePercentage }),
        ...(salary !== undefined && { salary }),
        ...(invoiceStatus !== undefined && { invoiceStatus }),
        ...(guaranteePeriod !== undefined && { guaranteePeriod }),
        ...(guaranteeExpiry !== undefined && { guaranteeExpiry }),
        ...(notes !== undefined && { notes }),
      },
    });

    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await logActivity({
      action: "PLACEMENT_UPDATED",
      description: `Updated placement ${id}${invoiceStatus ? ` - invoice status: ${invoiceStatus}` : ""}`,
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

    const deleted = await prisma.placement.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });

    if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await logActivity({
      action: "PLACEMENT_DELETED",
      description: `Deleted placement ${id}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
