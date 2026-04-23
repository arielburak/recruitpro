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

    const {
      estimatedStartDate,
      startDate,
      feeAmount,
      feePercentage,
      salary,
      invoiceStatus,
      paymentTerms,
      paymentDueDate,
      guaranteePeriod,
      notes,
    } = body;

    // Any anchor or terms touch triggers a re-resolve of derived dates.
    const touchesGuarantee = startDate !== undefined || guaranteePeriod !== undefined;
    const touchesPaymentDue =
      paymentDueDate === undefined &&
      (estimatedStartDate !== undefined ||
        startDate !== undefined ||
        paymentTerms !== undefined);

    let guaranteeExpiry: Date | undefined;
    let resolvedDue: Date | undefined;

    if (touchesGuarantee || touchesPaymentDue) {
      const current = await prisma.placement.findFirst({
        where: { id, organizationId: ctx.organizationId },
      });
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const sd =
        startDate !== undefined
          ? startDate
            ? new Date(startDate)
            : null
          : current.startDate;
      const esd =
        estimatedStartDate !== undefined
          ? estimatedStartDate
            ? new Date(estimatedStartDate)
            : null
          : current.estimatedStartDate;
      const gp = guaranteePeriod ?? current.guaranteePeriod ?? 90;
      const pt = paymentTerms !== undefined ? paymentTerms : current.paymentTerms;

      if (touchesGuarantee && sd) {
        guaranteeExpiry = new Date(sd);
        guaranteeExpiry.setDate(guaranteeExpiry.getDate() + gp);
      }

      if (touchesPaymentDue && pt != null) {
        const anchor = sd ?? esd;
        if (anchor) {
          resolvedDue = new Date(anchor);
          resolvedDue.setDate(resolvedDue.getDate() + pt);
        }
      }
    }

    const updated = await prisma.placement.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...(estimatedStartDate !== undefined && {
          estimatedStartDate: estimatedStartDate ? new Date(estimatedStartDate) : null,
        }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(feeAmount !== undefined && { feeAmount }),
        ...(feePercentage !== undefined && { feePercentage }),
        ...(salary !== undefined && { salary }),
        ...(invoiceStatus !== undefined && { invoiceStatus }),
        ...(paymentTerms !== undefined && { paymentTerms }),
        ...(paymentDueDate !== undefined && {
          paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
        }),
        ...(touchesPaymentDue && resolvedDue !== undefined && { paymentDueDate: resolvedDue }),
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
