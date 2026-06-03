import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";
import {
  notifyOnNewClientJobComment,
  notifyOnNewJobComment,
} from "@/lib/chat-notifications";

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
    const mentions: string[] = Array.isArray(body.mentions)
      ? body.mentions.filter((m: unknown) => typeof m === "string")
      : [];
    const requestedType =
      body.type === "CLIENT_VISIBLE" ? "CLIENT_VISIBLE" : "CLIENT_INTERNAL";

    // For CLIENT_VISIBLE we also stamp the agency-side jobId so the
    // row appears on /jobs/[id] Notes for recruiters without a
    // separate mirror table. Lookup via ACCEPTED FirmEngagement. If
    // there's no engagement yet the row stays client-side only
    // (the agency can't read it anyway).
    let agencyJobId: string | null = null;
    if (requestedType === "CLIENT_VISIBLE") {
      const eng = await prisma.firmEngagement.findFirst({
        where: { clientJobId: id, status: "ACCEPTED", jobId: { not: null } },
        select: { jobId: true },
      });
      agencyJobId = eng?.jobId ?? null;
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
