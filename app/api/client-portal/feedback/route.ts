import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { submissionId, score, feedback, comment, token } = body;

    let clientUserId: string | null = null;

    // Try authenticated client user first
    try {
      const ctx = await getClientContext();
      clientUserId = ctx.clientUserId;
    } catch {
      // Token-based access - no auth needed for comments but ratings require a client user
    }

    if (score && clientUserId) {
      await prisma.candidateRating.upsert({
        where: { submissionId_clientUserId: { submissionId, clientUserId } },
        create: { submissionId, clientUserId, score, feedback },
        update: { score, feedback },
      });
    }

    if (comment) {
      await prisma.comment.create({
        data: {
          content: comment,
          type: "CLIENT_VISIBLE",
          submissionId,
          clientUserId,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
