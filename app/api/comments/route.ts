import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import {
  notifyOnNewComment,
  notifyOnNewCandidateComment,
  notifyOnNewJobComment,
} from "@/lib/chat-notifications";
import { logActivity } from "@/lib/activity";
import { validateCommentScope } from "@/lib/comment-access";
import { canAccessJob } from "@/lib/job-access";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContextWithActiveSub();
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

    const rawMentions: string[] = Array.isArray(body.mentions)
      ? body.mentions.filter((m: unknown) => typeof m === "string")
      : [];

    // Server-side scope guard. Enforces: (a) CLIENT_VISIBLE only on
    // shared submissions, (b) mentions filtered to people with real
    // access to the destination, (c) cross-tenant isolation.
    const scope = await validateCommentScope(
      prisma,
      { kind: "agency", userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role },
      {
        type: requestedType,
        submissionId: body.submissionId || null,
        candidateId: body.candidateId || null,
        jobId: body.jobId || null,
        mentions: rawMentions,
      },
    );
    if (!scope.allowed) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }
    const mentions = scope.mentions;

    // Access gate: el caller tiene que poder ver el job del target.
    // Sin esto, un USER del mismo org sin asignación al job podía
    // postear comments en submissions/jobs ajenos y, vía el fallback
    // mention-based en /api/jobs/[id], auto-promocionarse a ver el
    // job entero. Audit 2026-06-23.
    let gateJobId: string | null = null;
    if (body.submissionId) {
      const sub = await prisma.candidateSubmission.findUnique({
        where: { id: body.submissionId },
        select: { jobId: true, job: { select: { organizationId: true } } },
      });
      if (sub && sub.job.organizationId === ctx.organizationId) {
        gateJobId = sub.jobId;
      }
    } else if (body.jobId) {
      gateJobId = body.jobId;
    }
    if (gateJobId) {
      const allowed = await canAccessJob(
        gateJobId,
        ctx.organizationId,
        ctx.userId,
        ctx.role,
      );
      if (!allowed) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else if (body.candidateId) {
      // Candidate-level chat: solo permitir si es ADMIN o el owner del
      // candidato. Sino el USER podia auto-mencionarse en cualquier
      // candidate del org para gatillar notificaciones cruzadas.
      const cand = await prisma.candidate.findUnique({
        where: { id: body.candidateId },
        select: { organizationId: true, ownerId: true },
      });
      const sameOrg = cand?.organizationId === ctx.organizationId;
      const isOwner = cand?.ownerId === ctx.userId;
      if (!sameOrg || (ctx.role !== "ADMIN" && !isOwner)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    // When the agency posts a CLIENT_VISIBLE Job note, mirror the
    // row onto the ClientJob it backs (via accepted FirmEngagement)
    // so the comment shows up on the client portal Notes tab as
    // "Shared with Agency". Without this stamp the client side
    // queries clientJob.comments and never sees agency-posted
    // visible notes. Internal comments don't get clientJobId — the
    // client never reads INTERNAL.
    let clientJobIdForRow: string | null = null;
    if (body.jobId && requestedType === "CLIENT_VISIBLE") {
      const eng = await prisma.firmEngagement.findFirst({
        where: {
          jobId: body.jobId,
          status: "ACCEPTED",
          organizationId: ctx.organizationId,
        },
        select: { clientJobId: true },
      });
      clientJobIdForRow = eng?.clientJobId ?? null;
    }

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
        clientJobId: clientJobIdForRow,
        userId: ctx.userId,
        mentions,
      },
      include: {
        user: { select: { name: true } },
      },
    });

    // Fire-and-forget notifications. Three paths:
    //   - Submission-scoped → full fanout (mentions + audience on the
    //     other side via notifyOnNewComment).
    //   - Candidate-scoped → mentions + candidate owner. No client
    //     side because the candidate spans many submissions.
    //   - Job-scoped → mentions + JobAssignment members. Internal-only.
    const authorName =
      ctx.userName || comment.user?.name || "A recruiter";
    if (body.submissionId) {
      notifyOnNewComment({
        submissionId: body.submissionId,
        commentType: requestedType,
        content,
        mentions,
        authorKind: "staffing",
        authorId: ctx.userId,
        authorName,
        authorEmail: ctx.userEmail || undefined,
      }).catch((e) => console.error("[comments POST] notify failed:", e));
    } else if (body.candidateId) {
      notifyOnNewCandidateComment({
        candidateId: body.candidateId,
        content,
        mentions,
        authorId: ctx.userId,
        authorName,
        authorEmail: ctx.userEmail || undefined,
      }).catch((e) =>
        console.error("[comments POST] candidate notify failed:", e),
      );
    } else if (body.jobId) {
      notifyOnNewJobComment({
        jobId: body.jobId,
        content,
        mentions,
        authorId: ctx.userId,
        authorName,
        authorEmail: ctx.userEmail || undefined,
      }).catch((e) =>
        console.error("[comments POST] job notify failed:", e),
      );
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
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
