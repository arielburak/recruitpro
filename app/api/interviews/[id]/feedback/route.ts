import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Verify interview belongs to org
    const interview = await prisma.interview.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!interview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const feedback = await prisma.interviewFeedback.findMany({
      where: { interviewId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(feedback);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContextWithActiveSub();
    const { id } = await params;
    const body = await request.json();

    const { type, rating, comment, authorName } = body;

    if (!comment?.trim()) {
      return NextResponse.json(
        { error: "Comment is required" },
        { status: 400 }
      );
    }

    // Verify interview belongs to org
    const interview = await prisma.interview.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!interview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const feedback = await prisma.interviewFeedback.create({
      data: {
        interviewId: id,
        type: type || "INTERNAL",
        rating: rating ? parseInt(rating) : null,
        comment: comment.trim(),
        authorName: authorName || ctx.userName,
        userId: type === "CLIENT" ? null : ctx.userId,
      },
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
