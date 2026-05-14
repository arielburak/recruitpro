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
      candidateId: rawCandidateId,
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
    // Final submissionId stored on the placement. Starts from the body
    // (existing submission-anchored flow) and is filled in by the manual
    // path when a candidateId is provided — we either find an existing
    // submission for (candidate, job) or create one server-side so the
    // placement is always tied to a pipeline row.
    let placementSubmissionId: string | undefined = submissionId;

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
      // Manual placement (recruiter is back-filling history or recording
      // a placement that started outside the pipeline). Job + client are
      // required; candidate is now also required from the dialog, and
      // when provided we link the placement to a pipeline submission
      // (creating it if there's no existing one).
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

      if (rawCandidateId) {
        const candidate = await prisma.candidate.findFirst({
          where: { id: rawCandidateId, organizationId: ctx.organizationId },
          select: { id: true, firstName: true, lastName: true },
        });
        if (!candidate) {
          return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }
        candidateLabel = `${candidate.firstName} ${candidate.lastName}`;

        let submission = await prisma.candidateSubmission.findFirst({
          where: { candidateId: candidate.id, jobId: job.id },
          select: { id: true },
        });
        if (!submission) {
          // Seed the new submission at the job's first stage. We'll flip
          // it to "Placed" below, in the same block that handles the
          // existing-submission path.
          const firstStage = await prisma.pipelineStage.findFirst({
            where: { jobId: job.id },
            orderBy: { order: "asc" },
            select: { id: true },
          });
          if (!firstStage) {
            return NextResponse.json(
              { error: "Job has no pipeline stages — can't place this candidate." },
              { status: 500 }
            );
          }
          submission = await prisma.candidateSubmission.create({
            data: {
              candidateId: candidate.id,
              jobId: job.id,
              stageId: firstStage.id,
              submittedBy: ctx.userId,
            },
            select: { id: true },
          });
        }

        // Each submission can have at most one placement.
        const existing = await prisma.placement.findUnique({
          where: { submissionId: submission.id },
        });
        if (existing) {
          return NextResponse.json(
            { error: "This candidate already has a placement on this job." },
            { status: 409 }
          );
        }

        placementSubmissionId = submission.id;
      }
    }

    const gp = guaranteePeriod ?? 90;
    const explicitStartDate = startDate ? new Date(startDate) : null;
    const estimatedValue = estimatedStartDate ? new Date(estimatedStartDate) : null;
    // When the caller only sends `estimatedStartDate` (the create-time
    // dialog asks for one date), promote it to `startDate` too. The
    // recruiter usually means "this is when the candidate is starting"
    // and the planned vs. confirmed distinction only matters later in
    // the placement's life, where the edit dialog still exposes both
    // fields separately for cases where the actual start ends up
    // differing from the original estimate.
    const startDateValue = explicitStartDate ?? estimatedValue;

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
        submissionId: placementSubmissionId || null,
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

    // Flip the linked submission to the canonical "Placed" stage so the
    // pipeline matches the placement record. Covers both paths now:
    //   - kanban-anchored placements (submissionId from body)
    //   - manual placements where we found/created the submission above
    if (placementSubmissionId) {
      const placedStage = await prisma.pipelineStage.findFirst({
        where: { jobId: jobId!, name: "Placed" },
      });
      if (placedStage) {
        await prisma.candidateSubmission.update({
          where: { id: placementSubmissionId },
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
