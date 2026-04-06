import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const body = await request.json();

    const submission = await prisma.candidateSubmission.findFirst({
      where: { id },
      include: {
        job: { select: { organizationId: true, title: true } },
        candidate: { select: { firstName: true, lastName: true } },
        stage: { select: { name: true } },
      },
    });

    if (!submission || submission.job.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (body.stageId) updateData.stageId = body.stageId;
    if (body.isSharedWithClient !== undefined) updateData.isSharedWithClient = body.isSharedWithClient;
    if (body.notes !== undefined) updateData.notes = body.notes;

    await prisma.candidateSubmission.update({
      where: { id },
      data: updateData,
    });

    if (body.stageId) {
      const newStage = await prisma.pipelineStage.findUnique({
        where: { id: body.stageId },
      });
      await logActivity({
        action: "submission.stage_changed",
        description: `${ctx.userName} moved ${submission.candidate.firstName} ${submission.candidate.lastName} from "${submission.stage.name}" to "${newStage?.name}" in "${submission.job.title}"`,
        userId: ctx.userId,
        candidateId: submission.candidateId,
        organizationId: ctx.organizationId,
      });
    }

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

    const submission = await prisma.candidateSubmission.findFirst({
      where: { id },
      include: { job: { select: { organizationId: true } } },
    });

    if (!submission || submission.job.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.candidateSubmission.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
