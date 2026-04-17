import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { notifyOnNewComment } from "@/lib/chat-notifications";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const requestedType = body.type || "INTERNAL";
    if (requestedType !== "INTERNAL" && requestedType !== "CLIENT_VISIBLE") {
      return NextResponse.json(
        { error: "Staffing can only post INTERNAL or CLIENT_VISIBLE comments" },
        { status: 400 }
      );
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const mentions: string[] = Array.isArray(body.mentions) ? body.mentions.filter((m: unknown) => typeof m === "string") : [];

    const comment = await prisma.comment.create({
      data: {
        content,
        type: requestedType,
        candidateId: body.candidateId || null,
        submissionId: body.submissionId || null,
        userId: ctx.userId,
        mentions,
      },
      include: {
        user: { select: { name: true } },
      },
    });

    // Fire-and-forget notifications
    if (body.submissionId) {
      notifyOnNewComment({
        submissionId: body.submissionId,
        commentType: requestedType,
        content,
        mentions,
        authorKind: "staffing",
        authorId: ctx.userId,
        authorName: ctx.userName || comment.user?.name || "A recruiter",
      }).catch((e) => console.error("[comments POST] notify failed:", e));
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
