import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { canAccessJob } from "@/lib/job-access";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET() {
  try {
    const ctx = await getOrgContext();

    const placements = await prisma.placement.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        job: { select: { id: true, title: true, currency: true } },
        client: { select: { id: true, name: true } },
        // Explicit per-placement recruiter override. Falls back to
        // candidate.owner client-side when null (legacy rows + manual
        // placements without a linked candidate).
        recruiter: { select: { id: true, name: true } },
        submission: {
          select: {
            id: true,
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                owner: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(placements);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

// Resolve when the agency expects to be paid: anchor on startDate,
// fall back to estimatedStartDate. Returns undefined if neither
// anchor nor terms exist. Uses UTC date math so a runtime in a
// non-UTC TZ doesn't shift the result by one day (the dates here
// represent calendar days, not moments in time).
function computePaymentDueDate(
  estimatedStartDate: Date | null | undefined,
  startDate: Date | null | undefined,
  paymentTerms: number | null | undefined
): Date | undefined {
  if (paymentTerms == null) return undefined;
  const anchor = startDate ?? estimatedStartDate;
  if (!anchor) return undefined;
  const due = new Date(anchor);
  due.setUTCDate(due.getUTCDate() + paymentTerms);
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
      // Placement kind: "HH" (headhunting / contingent — one-time fee) or
      // "OS" (outsourcing / staff aug — recurring monthlyFee). Different
      // pricing fields apply per kind; we filter the payload below so an
      // OS row can't accidentally land with a giant flat feeAmount.
      kind: rawKind,
      monthlyFee,
      endDate,
      feeAmount,
      feePercentage,
      salary,
      currency,
      salaryPeriod,
      salaryKind,
      paymentTerms,
      paymentDueDate,
      guaranteePeriod,
      notes,
      recruiterId: rawRecruiterId,
    } = body;

    const kind = rawKind === "OS" ? "OS" : "HH";

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

      // SECURITY 2026-06-17: tambien gateamos la rama submission-anchored.
      // El submissionId lo arma el cliente — un USER sin acceso al Job
      // podia mandarle el id de una submission ajena y crear el Placement.
      const allowedSub = await canAccessJob(submission.job.id, ctx.organizationId, ctx.userId, ctx.role);
      if (!allowedSub) {
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
      // SECURITY 2026-06-17: en la rama manual el caller arma el body
      // con rawJobId arbitrario — sin canAccessJob, un USER sin
      // assignment al Job podia crear un Placement (y de paso un
      // CandidateSubmission "Placed") en un job ajeno.
      const allowed = await canAccessJob(job.id, ctx.organizationId, ctx.userId, ctx.role);
      if (!allowed) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
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
          // UTC date math: same reason as computePaymentDueDate above
          // — the input is a calendar date, not a moment in time.
          const d = new Date(startDateValue);
          d.setUTCDate(d.getUTCDate() + gp);
          return d;
        })()
      : undefined;

    const resolvedDue = paymentDueDate
      ? new Date(paymentDueDate)
      : computePaymentDueDate(estimatedValue, startDateValue, paymentTerms);

    // Resolve recruiter attribution. Order of preference:
    //   1. Explicit body.recruiterId (the form override).
    //   2. Candidate's owner (the default — most placements stay
    //      attributed to whoever sourced).
    //   3. Null (rare manual rows with no linked candidate).
    // Validates against the org so a hand-crafted payload can't
    // attribute the placement to a user from another firm.
    let resolvedRecruiterId: string | null = null;
    if (rawRecruiterId && typeof rawRecruiterId === "string") {
      const u = await prisma.user.findFirst({
        where: { id: rawRecruiterId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (u) resolvedRecruiterId = u.id;
    }
    if (!resolvedRecruiterId && placementSubmissionId) {
      const linked = await prisma.candidateSubmission.findUnique({
        where: { id: placementSubmissionId },
        select: { candidate: { select: { ownerId: true } } },
      });
      resolvedRecruiterId = linked?.candidate?.ownerId ?? null;
    }

    // Kind-aware field selection. HH placements carry the historical
    // flat-fee shape; OS placements only keep the recurring-billing
    // fields (monthlyFee + endDate) — feeAmount / feePercentage /
    // paymentTerms / guarantee don't apply to staff aug and would
    // mislead any KPI that mixes the two.
    const placementData: any = {
      submissionId: placementSubmissionId || null,
      jobId: jobId!,
      clientId: clientId!,
      organizationId: ctx.organizationId,
      kind,
      estimatedStartDate: estimatedValue ?? undefined,
      startDate: startDateValue ?? undefined,
      salary,
      currency: currency ?? undefined,
      salaryPeriod: salaryPeriod ?? undefined,
      salaryKind: salaryKind ?? undefined,
      notes,
      recruiterId: resolvedRecruiterId,
    };
    if (kind === "OS") {
      placementData.monthlyFee = monthlyFee;
      placementData.endDate = endDate ? new Date(endDate) : null;
    } else {
      placementData.feeAmount = feeAmount;
      placementData.feePercentage = feePercentage;
      placementData.paymentTerms = paymentTerms ?? undefined;
      placementData.paymentDueDate = resolvedDue ?? undefined;
      placementData.guaranteePeriod = gp;
      placementData.guaranteeExpiry = guaranteeExpiry;
    }

    const placement = await prisma.placement.create({ data: placementData });

    // Flip the linked submission to the canonical "Placed" stage so the
    // pipeline matches the placement record. Covers both paths now:
    //   - kanban-anchored placements (submissionId from body)
    //   - manual placements where we found/created the submission above
    if (placementSubmissionId) {
      const placedStage = await prisma.pipelineStage.findFirst({
        where: { jobId: jobId!, name: "Placed" },
      });
      // Mirror to the client-side pipeline too. Without this the
      // client portal kanban keeps showing the candidate as "Offered"
      // (the stage they were in before the placement was logged) even
      // though the agency side correctly marks them Placed — bug the
      // user flagged via the "Client: Offered" pill on a Placed card.
      const placedClientStage = await prisma.clientPipelineStage.findFirst({
        where: { clientId: clientId!, name: "Placed" },
      });
      if (placedStage) {
        await prisma.candidateSubmission.update({
          where: { id: placementSubmissionId },
          data: {
            stageId: placedStage.id,
            ...(placedClientStage ? { clientStageId: placedClientStage.id } : {}),
          },
        });
      }
    }

    // Auto-flip the JOB status to FILLED once every seat is placed.
    // Single-opening searches (the common case) hit FILLED on the
    // first placement; multi-opening searches stay Active until the
    // last seat is filled. The recruiter can still override the
    // status manually from the inline dropdown if they're searching
    // for a guarantee replacement, etc.
    const jobMeta = await prisma.job.findUnique({
      where: { id: jobId! },
      select: { openings: true, status: true },
    });
    if (jobMeta && jobMeta.status !== "FILLED") {
      const placementsForJob = await prisma.placement.count({
        where: { jobId: jobId!, organizationId: ctx.organizationId },
      });
      if (placementsForJob >= (jobMeta.openings || 1)) {
        await prisma.job.update({
          where: { id: jobId! },
          data: { status: "FILLED" },
        });
        // ROADMAP.md #22 — we intentionally DON'T notify the client
        // when a job auto-flips to FILLED on placement creation. The
        // shared helper already early-returns for non-ON_HOLD status
        // changes (see lib/job-status-notifications.ts), so the call
        // we used to make here was a no-op AND the comment misled
        // future devs into thinking the client got pinged. The agency
        // tells the client manually when the placement is firm — if a
        // pre-signature flip got auto-announced and then reverted,
        // the client would have celebrated for nothing.
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
