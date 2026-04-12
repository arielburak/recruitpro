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
        job: { select: { id: true, title: true } },
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

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const { submissionId, startDate, feeAmount, feePercentage, salary, guaranteePeriod, notes } = body;

    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 }
      );
    }

    // Fetch submission and validate it belongs to the org (via job)
    const submission = await prisma.candidateSubmission.findFirst({
      where: { id: submissionId },
      include: {
        job: {
          select: { id: true, clientId: true, organizationId: true, title: true },
        },
        candidate: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    if (!submission || submission.job.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Check if placement already exists for this submission
    const existing = await prisma.placement.findUnique({
      where: { submissionId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A placement already exists for this submission" },
        { status: 409 }
      );
    }

    // Calculate guarantee expiry if startDate and guaranteePeriod are provided
    let guaranteeExpiry: Date | undefined;
    const gp = guaranteePeriod ?? 90;
    if (startDate) {
      guaranteeExpiry = new Date(startDate);
      guaranteeExpiry.setDate(guaranteeExpiry.getDate() + gp);
    }

    const placement = await prisma.placement.create({
      data: {
        submissionId,
        jobId: submission.job.id,
        clientId: submission.job.clientId,
        organizationId: ctx.organizationId,
        startDate: startDate ? new Date(startDate) : undefined,
        feeAmount,
        feePercentage,
        salary,
        guaranteePeriod: gp,
        guaranteeExpiry,
        notes,
      },
    });

    // Move submission to "Placed" stage if such a stage exists for the job
    const placedStage = await prisma.pipelineStage.findFirst({
      where: { jobId: submission.job.id, name: "Placed" },
    });
    if (placedStage) {
      await prisma.candidateSubmission.update({
        where: { id: submissionId },
        data: { stageId: placedStage.id },
      });
    }

    await logActivity({
      action: "PLACEMENT_CREATED",
      description: `Placed ${submission.candidate.firstName} ${submission.candidate.lastName} on ${submission.job.title}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(placement, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
