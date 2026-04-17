import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// PATCH — move a candidate to a different client pipeline stage
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { submissionId } = await params;
    const body = await request.json();
    const clientStageId = typeof body.clientStageId === "string" ? body.clientStageId : null;

    if (!clientStageId) {
      return NextResponse.json({ error: "clientStageId is required" }, { status: 400 });
    }

    // Verify submission belongs to this client AND is shared
    const submission = await prisma.candidateSubmission.findFirst({
      where: {
        id: submissionId,
        isSharedWithClient: true,
        job: { clientId: ctx.clientId },
      },
      select: { id: true, clientStageId: true },
    });
    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify the target stage belongs to this client
    const stage = await prisma.clientPipelineStage.findFirst({
      where: { id: clientStageId, clientId: ctx.clientId },
      select: { id: true, name: true },
    });
    if (!stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    if (submission.clientStageId === clientStageId) {
      return NextResponse.json({ success: true, noChange: true });
    }

    await prisma.candidateSubmission.update({
      where: { id: submissionId },
      data: { clientStageId },
    });

    return NextResponse.json({ success: true, stage });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
