import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Helper: verify the submission belongs to this client AND is shared
async function verifyAccess(submissionId: string, clientId: string) {
  const submission = await prisma.candidateSubmission.findFirst({
    where: {
      id: submissionId,
      isSharedWithClient: true,
      job: { clientId },
    },
    select: { id: true },
  });
  return !!submission;
}

// GET all feedback (ratings + comments) for this submission
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { submissionId } = await params;

    const ok = await verifyAccess(submissionId, ctx.clientId);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [ratings, comments] = await Promise.all([
      prisma.candidateRating.findMany({
        where: { submissionId },
        select: {
          id: true,
          score: true,
          feedback: true,
          createdAt: true,
          clientUser: { select: { id: true, name: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { submissionId, type: "CLIENT_VISIBLE" },
        select: {
          id: true,
          content: true,
          createdAt: true,
          clientUser: { select: { id: true, name: true, title: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ ratings, comments });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST submit/update rating + comment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { submissionId } = await params;

    const ok = await verifyAccess(submissionId, ctx.clientId);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const score = typeof body.score === "number" && body.score >= 1 && body.score <= 5 ? body.score : null;
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";

    if (!score && !feedback && !comment) {
      return NextResponse.json({ error: "Provide at least a rating or a comment" }, { status: 400 });
    }

    // Upsert rating if score provided
    if (score) {
      await prisma.candidateRating.upsert({
        where: {
          submissionId_clientUserId: {
            submissionId,
            clientUserId: ctx.clientUserId,
          },
        },
        create: {
          submissionId,
          clientUserId: ctx.clientUserId,
          score,
          feedback: feedback || null,
        },
        update: {
          score,
          feedback: feedback || null,
        },
      });
    }

    // Create a separate comment if provided (threaded feedback)
    if (comment) {
      await prisma.comment.create({
        data: {
          content: comment,
          type: "CLIENT_VISIBLE",
          submissionId,
          clientUserId: ctx.clientUserId,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
