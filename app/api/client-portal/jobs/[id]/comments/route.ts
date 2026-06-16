import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";
import {
  notifyOnNewClientJobComment,
  notifyOnNewJobComment,
} from "@/lib/chat-notifications";
import { validateCommentScope } from "@/lib/comment-access";

// Chat-style notes thread on the client-portal job page. Accepts two
// scopes mirroring the agency side:
//
//   CLIENT_INTERNAL  → only the client team. Agency never sees.
//                      Mention fan-out via notifyOnNewClientJobComment.
//   CLIENT_VISIBLE   → shared with the agency. We also stamp the
//                      agency-side jobId on the row so it surfaces on
//                      /jobs/[id] Notes for the recruiters, and route
//                      mention/audience fan-out through
//                      notifyOnNewJobComment.
//
// Default stays CLIENT_INTERNAL so a misconfigured caller can't
// accidentally leak a private note to the agency.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const body = await request.json();

    const job = await prisma.clientJob.findFirst({
      where: { id, clientId: ctx.clientId },
      include: { members: { select: { clientUserId: true } } },
    });
    if (!job || !canAccessClientJob(ctx, job)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    const rawMentions: string[] = Array.isArray(body.mentions)
      ? body.mentions.filter((m: unknown) => typeof m === "string")
      : [];
    const requestedType =
      body.type === "CLIENT_VISIBLE" ? "CLIENT_VISIBLE" : "CLIENT_INTERNAL";

    // Server-side scope guard. Filters mentions to people who can
    // actually see this ClientJob (client members + agency assignees
    // when the scope is CLIENT_VISIBLE). Mirrors the agency-side
    // /api/comments check so both surfaces share one rule set.
    const scope = await validateCommentScope(
      prisma,
      { kind: "client", clientUserId: ctx.clientUserId, clientId: ctx.clientId },
      { type: requestedType, clientJobId: id, mentions: rawMentions },
    );
    if (!scope.allowed) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }
    const mentions = scope.mentions;

    // For CLIENT_VISIBLE we stamp the agency-side jobId on the row
    // so the recruiters of that specific firm — and ONLY them —
    // see it on /jobs/[id] Notes. When the JO has multiple
    // accepted engagements (the client is working with 2+ firms),
    // the caller MUST pass `targetAgencyJobId` so we know which
    // firm the message is for. One-engagement case keeps the old
    // implicit resolution for backwards compatibility.
    let agencyJobId: string | null = null;
    if (requestedType === "CLIENT_VISIBLE") {
      const targetAgencyJobId =
        typeof body.targetAgencyJobId === "string" && body.targetAgencyJobId
          ? body.targetAgencyJobId
          : null;

      if (targetAgencyJobId) {
        // Verify the supplied jobId is actually one of THIS ClientJob's
        // accepted engagements — prevents a tampered payload from
        // routing a comment to an unrelated agency Job.
        const eng = await prisma.firmEngagement.findFirst({
          where: {
            clientJobId: id,
            status: "ACCEPTED",
            jobId: targetAgencyJobId,
          },
          select: { jobId: true },
        });
        agencyJobId = eng?.jobId ?? null;
        if (!agencyJobId) {
          return NextResponse.json(
            { error: "Selected firm isn't engaged on this job" },
            { status: 400 },
          );
        }
      } else {
        // Implicit resolution: only works with a single engagement.
        const engagements = await prisma.firmEngagement.findMany({
          where: { clientJobId: id, status: "ACCEPTED", jobId: { not: null } },
          select: { jobId: true },
        });
        if (engagements.length === 1) {
          agencyJobId = engagements[0].jobId;
        } else if (engagements.length > 1) {
          return NextResponse.json(
            {
              error:
                "Multiple firms engaged — specify targetAgencyJobId to pick which one this message is for.",
            },
            { status: 400 },
          );
        }
        // 0 engagements → leave agencyJobId null; the row is still
        // saved as CLIENT_VISIBLE but no firm sees it yet.
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        type: requestedType,
        clientJobId: id,
        jobId: agencyJobId,
        clientUserId: ctx.clientUserId,
        mentions,
      },
      select: {
        id: true,
        content: true,
        type: true,
        mentions: true,
        createdAt: true,
        clientUserId: true,
        clientUser: { select: { id: true, name: true, title: true } },
        userId: true,
        user: { select: { id: true, name: true } },
      },
    });

    // Fire-and-forget fan-out. Internal scope reuses the client-job
    // notifier; visible scope routes through the agency-job notifier
    // so the recruiter assignees get pinged the same way they would
    // for an agency-posted comment.
    const authorName = comment.clientUser?.name || "A teammate";
    if (mentions.length > 0 || requestedType === "CLIENT_VISIBLE") {
      if (requestedType === "CLIENT_INTERNAL") {
        notifyOnNewClientJobComment({
          clientJobId: id,
          content,
          mentions,
          authorId: ctx.clientUserId,
          authorName,
          authorEmail: ctx.userEmail || undefined,
        }).catch((e) =>
          console.error("[client-job-comments POST] internal notify failed:", e),
        );
      } else if (agencyJobId) {
        notifyOnNewJobComment({
          jobId: agencyJobId,
          content,
          mentions,
          authorId: ctx.clientUserId,
          authorName,
          authorEmail: ctx.userEmail || undefined,
        }).catch((e) =>
          console.error("[client-job-comments POST] visible notify failed:", e),
        );
      }
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
