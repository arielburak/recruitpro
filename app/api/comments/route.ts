import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { notifyOnNewComment, notifyOnNewCandidateComment } from "@/lib/chat-notifications";
import { logActivity } from "@/lib/activity";

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
        // Job-level chat: the Notes tab on /jobs/[id]. Distinct from
        // per-submission chat (submissionId) so a recruiter can log
        // "this client cobra X bajo la mesa" without it being tied
        // to a specific candidate.
        jobId: body.jobId || null,
        userId: ctx.userId,
        mentions,
      },
      include: {
        user: { select: { name: true } },
      },
    });

    // Fire-and-forget notifications. Two paths:
    //   - Submission-scoped → full fanout (mentions + audience on the
    //     other side via notifyOnNewComment).
    //   - Candidate-scoped → mention-only fanout (no client to share
    //     with, candidate may be across many submissions).
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
    } else if (body.candidateId) {
      notifyOnNewCandidateComment({
        candidateId: body.candidateId,
        content,
        mentions,
        authorId: ctx.userId,
        authorName: ctx.userName || comment.user?.name || "A recruiter",
      }).catch((e) => console.error("[comments POST] candidate notify failed:", e));
    }

    // Activity log for the candidate's history tab. Job-level comments
    // (no candidate, no submission) don't get logged here — the Notes
    // tab on the job page IS their timeline. For per-submission posts
    // we look up the underlying candidate so the entry shows up on
    // that candidate's Activity tab regardless of which job they came
    // through.
    try {
      let activityCandidateId: string | null = body.candidateId || null;
      if (!activityCandidateId && body.submissionId) {
        const sub = await prisma.candidateSubmission.findUnique({
          where: { id: body.submissionId },
          select: { candidateId: true },
        });
        activityCandidateId = sub?.candidateId || null;
      }
      if (activityCandidateId) {
        const preview = content.length > 80 ? content.slice(0, 77) + "…" : content;
        const visibility = requestedType === "CLIENT_VISIBLE" ? "client-shared" : "internal";
        await logActivity({
          action: "comment.created",
          description: `${ctx.userName || comment.user?.name || "Someone"} posted a ${visibility} note: "${preview}"`,
          userId: ctx.userId,
          candidateId: activityCandidateId,
          organizationId: ctx.organizationId,
          metadata: {
            commentId: comment.id,
            type: requestedType,
            mentions: mentions.length,
            submissionId: body.submissionId || null,
            jobId: body.jobId || null,
          },
        });
      }
    } catch (e) {
      console.error("[comments POST] activity log failed:", e);
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
