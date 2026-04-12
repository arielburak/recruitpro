import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { validateClientPortalToken } from "@/lib/tokens";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { submissionId, rating, comment, token, clientName } = body;

    let clientUserId: string | null = null;

    // Try authenticated client user first
    try {
      const ctx = await getClientContext();
      clientUserId = ctx.clientUserId;
    } catch {
      // Token-based access — validate the token
      if (token) {
        const tokenRecord = await validateClientPortalToken(token);
        if (!tokenRecord) {
          return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }

    // If authenticated client user with a score, use the rating model
    if (rating && clientUserId) {
      await prisma.candidateRating.upsert({
        where: { submissionId_clientUserId: { submissionId, clientUserId } },
        create: { submissionId, clientUserId, score: rating, feedback: comment || "" },
        update: { score: rating, feedback: comment || "" },
      });
    }

    // Build structured comment content
    const hasRating = rating && rating >= 1 && rating <= 5;
    const hasComment = comment && comment.trim().length > 0;

    if (hasRating || hasComment) {
      const payload: Record<string, any> = {
        clientName: clientName || "Client",
      };
      if (hasRating) payload.rating = rating;
      if (hasComment) payload.text = comment.trim();

      await prisma.comment.create({
        data: {
          content: JSON.stringify(payload),
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
