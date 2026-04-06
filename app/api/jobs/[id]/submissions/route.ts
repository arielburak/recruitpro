import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id: jobId } = await params;
    const body = await request.json();
    const { candidateId } = body;

    // Verify job and candidate belong to org
    const [job, candidate] = await Promise.all([
      prisma.job.findFirst({
        where: { id: jobId, organizationId: ctx.organizationId },
        include: { stages: { orderBy: { order: "asc" }, take: 1 } },
      }),
      prisma.candidate.findFirst({
        where: { id: candidateId, organizationId: ctx.organizationId },
      }),
    ]);

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (job.stages.length === 0) return NextResponse.json({ error: "No pipeline stages" }, { status: 400 });

    // Check if already submitted
    const existing = await prisma.candidateSubmission.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Candidate already in this pipeline" }, { status: 400 });
    }

    const submission = await prisma.candidateSubmission.create({
      data: {
        candidateId,
        jobId,
        stageId: job.stages[0].id,
        submittedBy: ctx.userId,
      },
    });

    await logActivity({
      action: "submission.created",
      description: `${ctx.userName} added ${candidate.firstName} ${candidate.lastName} to "${job.title}"`,
      userId: ctx.userId,
      candidateId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(submission, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
