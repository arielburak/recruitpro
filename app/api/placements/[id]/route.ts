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
      // OS-specific fields (kind = "OS"). The form only sends these when
      // the user is editing an OS placement; on HH they stay undefined
      // and the existing flat-fee fields below take over.
      kind,
      monthlyFee,
      endDate,
      feeAmount,
      feePercentage,
      salary,
      currency,
      salaryPeriod,
      salaryKind,
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
        // UTC date math — see /api/placements POST. These values
        // represent calendar days, not moments in time, so local
        // getDate/setDate would silently flip them across UTC.
        guaranteeExpiry = new Date(sd);
        guaranteeExpiry.setUTCDate(guaranteeExpiry.getUTCDate() + gp);
      }

      if (touchesPaymentDue && pt != null) {
        const anchor = sd ?? esd;
        if (anchor) {
          resolvedDue = new Date(anchor);
          resolvedDue.setUTCDate(resolvedDue.getUTCDate() + pt);
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
        ...(kind !== undefined && { kind: kind === "OS" ? "OS" : "HH" }),
        ...(monthlyFee !== undefined && { monthlyFee }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(feeAmount !== undefined && { feeAmount }),
        ...(feePercentage !== undefined && { feePercentage }),
        ...(salary !== undefined && { salary }),
        ...(currency !== undefined && { currency }),
        ...(salaryPeriod !== undefined && { salaryPeriod }),
        ...(salaryKind !== undefined && { salaryKind }),
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

    // Pull the placement first — we need submissionId + jobId to roll
    // back the linked submission's stage out of "Placed" so the board
    // doesn't keep showing the candidate there after the placement is
    // gone. (Placements + submissions are intentionally a 1-1 record;
    // losing one but not the other leaves an inconsistent UI.)
    const placement = await prisma.placement.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, submissionId: true, jobId: true },
    });

    if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (placement.submissionId) {
      const submission = await prisma.candidateSubmission.findUnique({
        where: { id: placement.submissionId },
        select: { id: true, stage: { select: { name: true } } },
      });

      // Only rewrite the stage if the submission still sits at "Placed".
      // If the recruiter already moved them somewhere else, respect that.
      if (submission && submission.stage.name === "Placed") {
        // Prefer "Offered" — the natural step right before "Placed" in
        // the default pipeline, so the rollback feels like an undo. If
        // the job's pipeline has been customised and "Offered" isn't
        // there, fall back to the highest-order non-terminal stage
        // (which is whatever sits right before Placed in this job).
        const rollback =
          (await prisma.pipelineStage.findFirst({
            where: { jobId: placement.jobId, name: "Offered" },
            select: { id: true },
          })) ||
          (await prisma.pipelineStage.findFirst({
            where: {
              jobId: placement.jobId,
              name: { notIn: ["Placed", "Lost", "Rejected"] },
            },
            orderBy: { order: "desc" },
            select: { id: true },
          }));
        if (rollback) {
          await prisma.candidateSubmission.update({
            where: { id: submission.id },
            data: { stageId: rollback.id },
          });
        }
      }
    }

    await prisma.placement.delete({ where: { id } });

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
