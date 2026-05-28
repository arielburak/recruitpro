import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";
import { notifyOnNewClientJobComment } from "@/lib/chat-notifications";

// Chat-style notes thread on the client-portal job page. Mirrors the
// agency-side /api/comments endpoint but scoped to a ClientJob and
// hard-locked to CLIENT_INTERNAL — the recruiting firm never sees
// these rows, by design.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const body = await request.json();

    // Verify the caller is a member of this JO (or its creator, or
    // legacy-empty member list). canAccessClientJob centralizes the
    // rule so we don't drift from the GET / PUT endpoints.
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

    const comment = await prisma.comment.create({
      data: {
        content,
        type: "CLIENT_INTERNAL",
        clientJobId: id,
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
      },
    });

    // Fire-and-forget fan-out for mentions. We don't await so a slow
    // SMTP doesn't block the POST — the comment is already saved.
    if (mentions.length > 0) {
      notifyOnNewClientJobComment({
        clientJobId: id,
        content,
        mentions,
        authorId: ctx.clientUserId,
        authorName: comment.clientUser?.name || "A teammate",
      }).catch((e) =>
        console.error("[client-job-comments POST] notify failed:", e)
      );
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
