import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { notifyOnNewComment } from "@/lib/chat-notifications";
import { logActivity } from "@/lib/activity";
import { accessibleAgencyJobIds, type ClientCtx } from "@/lib/client-job-access";
import { safeErrorMessage } from "@/lib/safe-error";

// Helper: verify the submission belongs to this client AND is shared
// AND lives on an agency Job the caller is a member of (or which sits
// on a legacy-open ClientJob).
async function verifyAccess(submissionId: string, ctx: ClientCtx) {
  const visibleAgencyJobIds = await accessibleAgencyJobIds(prisma, ctx);
  if (visibleAgencyJobIds.length === 0) return false;
  // Multi-firm support: sin `job.clientId === ctx.clientId`. Cada
  // agencia tiene su propio Client record, asi que filtrar por
  // ctx.clientId solo matchea la primera. El gate correcto es
  // `jobId IN visibleAgencyJobIds`, que sale de ACCEPTED engagements
  // en ClientJobs accesibles.
  const submission = await prisma.candidateSubmission.findFirst({
    where: {
      id: submissionId,
      isSharedWithClient: true,
      jobId: { in: visibleAgencyJobIds },
    },
    select: { id: true },
  });
  return !!submission;
}

// GET all feedback (ratings + comments) for this submission
// Returns both CLIENT_VISIBLE (shared with staffing) and CLIENT_INTERNAL (client only)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { submissionId } = await params;

    const ok = await verifyAccess(submissionId, ctx);
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
        where: {
          submissionId,
          // Client portal sees CLIENT_VISIBLE (shared) + CLIENT_INTERNAL (own team).
          // Never INTERNAL (staffing-only).
          type: { in: ["CLIENT_VISIBLE", "CLIENT_INTERNAL"] },
        },
        select: {
          id: true,
          content: true,
          type: true,
          mentions: true,
          createdAt: true,
          clientUser: { select: { id: true, name: true, title: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ ratings, comments });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// POST submit/update rating + comment (optionally with type and mentions)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { submissionId } = await params;

    const ok = await verifyAccess(submissionId, ctx);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const score = typeof body.score === "number" && body.score >= 1 && body.score <= 5 ? body.score : null;
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const requestedType: "CLIENT_VISIBLE" | "CLIENT_INTERNAL" =
      body.type === "CLIENT_INTERNAL" ? "CLIENT_INTERNAL" : "CLIENT_VISIBLE";
    const mentions: string[] = Array.isArray(body.mentions)
      ? body.mentions.filter((m: unknown) => typeof m === "string")
      : [];

    if (!score && !feedback && !comment) {
      return NextResponse.json({ error: "Provide at least a rating or a comment" }, { status: 400 });
    }

    // Upsert rating if score provided (ratings are always visible — they're
    // ratings, not comments. The sharing model for ratings is unchanged.)
    // `as any` on the delegate sidesteps the Prisma generic-depth blow-up
    // TS hits on candidateRating.upsert with a compound where-clause.
    if (score) {
      await (prisma.candidateRating as any).upsert({
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
          type: requestedType,
          submissionId,
          clientUserId: ctx.clientUserId,
          mentions,
        },
      });

      // Fire-and-forget notifications
      notifyOnNewComment({
        submissionId,
        commentType: requestedType,
        content: comment,
        mentions,
        authorKind: "client",
        authorId: ctx.clientUserId,
        authorName: ctx.userName || "A teammate",
        authorEmail: ctx.userEmail || undefined,
      }).catch((e) => console.error("[client feedback POST] notify failed:", e));

      // Activity log: only surface CLIENT_VISIBLE posts on the
      // agency-side candidate timeline. CLIENT_INTERNAL is the
      // client's private team chat — leaking that into the agency's
      // activity feed would defeat the whole point of having two tabs.
      if (requestedType === "CLIENT_VISIBLE") {
        try {
          const sub = await prisma.candidateSubmission.findUnique({
            where: { id: submissionId },
            select: {
              candidateId: true,
              job: { select: { organizationId: true } },
            },
          });
          if (sub?.candidateId && sub.job?.organizationId) {
            const preview = comment.length > 80 ? comment.slice(0, 77) + "…" : comment;
            await logActivity({
              action: "comment.created",
              description: `${ctx.userName || "A client"} posted a client-shared note: "${preview}"`,
              candidateId: sub.candidateId,
              organizationId: sub.job.organizationId,
              metadata: {
                type: requestedType,
                mentions: mentions.length,
                submissionId,
                authorKind: "client",
                clientUserId: ctx.clientUserId,
              },
            });
          }
        } catch (e) {
          console.error("[client feedback POST] activity log failed:", e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
