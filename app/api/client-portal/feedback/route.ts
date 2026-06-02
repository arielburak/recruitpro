import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { validateClientPortalToken } from "@/lib/tokens";
import { sendCandidateFeedbackEmail } from "@/lib/email";
import { requireVerifiedEmail } from "@/lib/require-verified-email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { submissionId, rating, comment, token, clientName } = body;

    let clientUserId: string | null = null;

    // Try authenticated client user first
    try {
      const ctx = await getClientContext();
      // Logged-in ClientUser → must have verified the email
      // before notifying the agency. The token-public path
      // below is exempt: that flow runs off a one-shot share
      // link, no account state involved.
      const guard = await requireVerifiedEmail();
      if (guard) return guard;
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

    // If authenticated client user with a score, use the rating model.
    // `as any` sidesteps the Prisma generic-depth blow-up TS hits on
    // candidateRating.upsert with a compound where-clause.
    if (rating && clientUserId) {
      await (prisma.candidateRating as any).upsert({
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

    // Notify the recruiter who owns the candidate that feedback landed.
    // Fire-and-forget — never block the client's feedback save if mail fails.
    if (hasRating || hasComment) {
      (async () => {
        try {
          const submission = await prisma.candidateSubmission.findUnique({
            where: { id: submissionId },
            include: {
              candidate: { include: { owner: true } },
              job: { include: { client: true } },
            },
          });
          if (!submission?.candidate?.owner?.email) return;

          const origin =
            request.headers.get("origin") || process.env.NEXTAUTH_URL || "";

          await sendCandidateFeedbackEmail({
            to: submission.candidate.owner.email,
            recruiterName: submission.candidate.owner.name || undefined,
            candidateName: `${submission.candidate.firstName} ${submission.candidate.lastName}`,
            jobTitle: submission.job.title,
            clientCompanyName: submission.job.client.name,
            reviewerName: clientName || "A client reviewer",
            rating: hasRating ? rating : null,
            comment: hasComment ? comment : null,
            candidateUrl: `${origin}/candidates/${submission.candidateId}`,
          });
        } catch (err) {
          console.error("[feedback] notification email failed:", err);
        }
      })();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
