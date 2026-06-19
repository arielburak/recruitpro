import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { canAccessJob } from "@/lib/job-access";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id: jobId } = await params;
    const body = await request.json();
    const { candidateId } = body;

    // Verify job and candidate belong to org. Pull all stages so we
    // can land the candidate on "Sourced" by name rather than the
    // first-by-order — older jobs (and any future re-ordering work)
    // could leave a non-Sourced stage at position 0 and that bumped
    // freshly-added candidates straight into "Submitted", which is
    // a client-visible state. Sourced is sourcing-only.
    const [job, candidate] = await Promise.all([
      prisma.job.findFirst({
        where: { id: jobId, organizationId: ctx.organizationId },
        include: { stages: { orderBy: { order: "asc" } } },
      }),
      prisma.candidate.findFirst({
        where: { id: candidateId, organizationId: ctx.organizationId },
      }),
    ]);

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (job.stages.length === 0) return NextResponse.json({ error: "No pipeline stages" }, { status: 400 });

    // SECURITY 2026-06-17: aplicar canAccessJob para que un USER sin
    // assignment al job no pueda agregarle candidatos via POST directo.
    // 404 (no 403) sigue el mismo patron del #3 critico para no leakear
    // existencia.
    const allowed = await canAccessJob(jobId, ctx.organizationId, ctx.userId, ctx.role);
    if (!allowed) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check if already submitted
    const existing = await prisma.candidateSubmission.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Candidate already in this pipeline" }, { status: 400 });
    }

    // Prefer the stage literally named "Sourced" (case-insensitive,
    // matches DEFAULT_STAGES[0] in lib/constants.ts). Fall back to
    // the first stage if a custom pipeline doesn't have one — better
    // to place the candidate somewhere than reject the add.
    const sourcedStage =
      job.stages.find((s) => s.name.toLowerCase() === "sourced") ?? job.stages[0];

    const submission = await prisma.candidateSubmission.create({
      data: {
        candidateId,
        jobId,
        stageId: sourcedStage.id,
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
