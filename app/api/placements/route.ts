import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function GET() {
  try {
    const ctx = await getOrgContext();

    const placements = await prisma.placement.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        job: { select: { id: true, title: true, currency: true } },
        client: { select: { id: true, name: true } },
        submission: {
          select: {
            id: true,
            candidate: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(placements);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

// Resolve when the agency expects to be paid: anchor on startDate, fall back
// to estimatedStartDate. Returns undefined if neither anchor nor terms exist.
function computePaymentDueDate(
  estimatedStartDate: Date | null | undefined,
  startDate: Date | null | undefined,
  paymentTerms: number | null | undefined
): Date | undefined {
  if (paymentTerms == null) return undefined;
  const anchor = startDate ?? estimatedStartDate;
  if (!anchor) return undefined;
  const due = new Date(anchor);
  due.setDate(due.getDate() + paymentTerms);
  return due;
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const {
      submissionId,
      jobId: rawJobId,
      clientId: rawClientId,
      estimatedStartDate,
      startDate,
      feeAmount,
      feePercentage,
      salary,
      currency,
      salaryPeriod,
      paymentTerms,
      paymentDueDate,
      guaranteePeriod,
      notes,
    } = body;

    let jobId: string | undefined;
    let clientId: string | undefined;
    let candidateLabel = "candidate";
    let jobTitle = "job";

    if (submissionId) {
      // Submission-anchored placement (pipeline drag-to-Placed flow).
      const submission = await prisma.candidateSubmission.findFirst({
        where: { id: submissionId },
        include: {
          job: {
            select: { id: true, clientId: true, organizationId: true, title: true },
          },
          candidate: { select: { firstName: true, lastName: true } },
        },
      });

      if (!submission || submission.job.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      }

      const existing = await prisma.placement.findUnique({ where: { submissionId } });
      if (existing) {
        return NextResponse.json(
          { error: "A placement already exists for this submission" },
          { status: 409 }
        );
      }

      jobId = submission.job.id;
      clientId = submission.job.clientId;
      candidateLabel = `${submission.candidate.firstName} ${submission.candidate.lastName}`;
      jobTitle = submission.job.title;
    } else {
      // Manual placement (no submission — recruiter is back-filling history
      // or recording a placement that started outside the pipeline).
      if (!rawJobId || !rawClientId) {
        return NextResponse.json(
          { error: "Either submissionId, or jobId + clientId, is required" },
          { status: 400 }
        );
      }

      const job = await prisma.job.findFirst({
        where: { id: rawJobId, organizationId: ctx.organizationId },
        select: { id: true, clientId: true, title: true },
      });
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      if (job.clientId !== rawClientId) {
        return NextResponse.json(
          { error: "Job does not belong to the given client" },
          { status: 400 }
        );
      }

      jobId = job.id;
      clientId = job.clientId;
      jobTitle = job.title;
    }

    const gp = guaranteePeriod ?? 90;
    const startDateValue = startDate ? new Date(startDate) : null;
    const estimatedValue = estimatedStartDate ? new Date(estimatedStartDate) : null;

    const guaranteeExpiry = startDateValue
      ? (() => {
          const d = new Date(startDateValue);
          d.setDate(d.getDate() + gp);
          return d;
        })()
      : undefined;

    const resolvedDue = paymentDueDate
      ? new Date(paymentDueDate)
      : computePaymentDueDate(estimatedValue, startDateValue, paymentTerms);

    const placement = await prisma.placement.create({
      data: {
        submissionId: submissionId || null,
        jobId: jobId!,
        clientId: clientId!,
        organizationId: ctx.organizationId,
        estimatedStartDate: estimatedValue ?? undefined,
        startDate: startDateValue ?? undefined,
        feeAmount,
        feePercentage,
        salary,
        currency: currency ?? undefined,
        salaryPeriod: salaryPeriod ?? undefined,
        paymentTerms: paymentTerms ?? undefined,
        paymentDueDate: resolvedDue ?? undefined,
        guaranteePeriod: gp,
        guaranteeExpiry,
        notes,
      },
    });

    // For submission-anchored placements, also flip the submission to the
    // canonical "Placed" stage so the pipeline matches the placement record.
    if (submissionId) {
      const placedStage = await prisma.pipelineStage.findFirst({
        where: { jobId: jobId!, name: "Placed" },
      });
      if (placedStage) {
        await prisma.candidateSubmission.update({
          where: { id: submissionId },
          data: { stageId: placedStage.id },
        });
      }
    }

    await logActivity({
      action: "PLACEMENT_CREATED",
      description: `Placed ${candidateLabel} on ${jobTitle}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(placement, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
