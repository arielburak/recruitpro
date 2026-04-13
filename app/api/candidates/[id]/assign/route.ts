import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

// GET - fetch available jobs (not already assigned)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Get jobs this candidate is already submitted to
    const existingSubmissions = await prisma.candidateSubmission.findMany({
      where: { candidateId: id },
      select: { jobId: true },
    });
    const existingJobIds = existingSubmissions.map((s) => s.jobId);

    // Get open/active jobs not yet assigned
    const availableJobs = await prisma.job.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ["OPEN", "ACTIVE"] },
        id: { notIn: existingJobIds },
      },
      include: {
        client: { select: { name: true } },
        stages: { orderBy: { order: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(availableJobs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - assign candidate to multiple jobs
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const { jobIds } = await request.json();

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: "No jobs selected" }, { status: 400 });
    }

    // Verify candidate belongs to org
    const candidate = await prisma.candidate.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // For each job, get the first pipeline stage and create submission
    const results = [];
    for (const jobId of jobIds) {
      const firstStage = await prisma.pipelineStage.findFirst({
        where: { jobId },
        orderBy: { order: "asc" },
      });

      if (!firstStage) continue;

      try {
        const submission = await prisma.candidateSubmission.create({
          data: {
            candidateId: id,
            jobId,
            stageId: firstStage.id,
            submittedBy: ctx.userId,
          },
        });
        results.push(submission);

        await logActivity({
          action: "candidate.submitted",
          description: `${ctx.userName} submitted ${candidate.firstName} ${candidate.lastName} to a job`,
          userId: ctx.userId,
          candidateId: id,
          organizationId: ctx.organizationId,
        });
      } catch (e: any) {
        // Skip duplicates
        if (e.code === "P2002") continue;
        throw e;
      }
    }

    return NextResponse.json({ created: results.length }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
