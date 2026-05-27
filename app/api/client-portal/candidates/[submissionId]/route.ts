import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// GET candidate detail for a specific submission.
// Only accessible if the submission is shared with the calling client user's client.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { submissionId } = await params;

    const submission = await prisma.candidateSubmission.findFirst({
      where: {
        id: submissionId,
        isSharedWithClient: true,
        job: { clientId: ctx.clientId },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sharedAt: true,
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            linkedIn: true,
            location: true,
            currentTitle: true,
            currentCompany: true,
            skills: true,
            summary: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            organization: { select: { id: true, name: true } },
          },
        },
        stage: {
          select: { id: true, name: true, order: true, color: true },
        },
        clientStage: {
          select: { id: true, name: true, order: true, color: true, isTerminal: true, kind: true },
        },
        submitter: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!submission) {
      return NextResponse.json({ error: "Candidate not found or not shared" }, { status: 404 });
    }

    // Fetch candidate documents (linked to candidate directly)
    const documents = await prisma.document.findMany({
      where: { candidateId: submission.candidate.id },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // My rating. The Prisma client generic for `candidateRating` has
    // grown deep enough that the inferred awaited type trips
    // TS's "Excessive stack depth" comparison check during build.
    // Casting the delegate to `any` at the call site sidesteps the
    // comparison; we narrow the result with an explicit type so the
    // rest of the file stays typed.
    type MyRating = { score: number; feedback: string | null; createdAt: Date } | null;
    const myRating: MyRating = await (prisma.candidateRating as any).findFirst({
      where: {
        submissionId,
        clientUserId: ctx.clientUserId,
      },
      select: { score: true, feedback: true, createdAt: true },
    });

    // All ratings from this client's team
    const allRatings = await prisma.candidateRating.findMany({
      where: { submissionId },
      select: {
        id: true,
        score: true,
        feedback: true,
        createdAt: true,
        clientUser: { select: { id: true, name: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Client-side comments: CLIENT_VISIBLE (shared) + CLIENT_INTERNAL (client-only)
    const comments = await prisma.comment.findMany({
      where: {
        submissionId,
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
    });

    const scores = allRatings.map((r) => r.score).filter((s): s is number => typeof s === "number" && s > 0);
    const avgRating = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    return NextResponse.json({
      submissionId: submission.id,
      candidate: submission.candidate,
      job: {
        id: submission.job.id,
        title: submission.job.title,
      },
      firm: {
        id: submission.job.organization.id,
        name: submission.job.organization.name,
      },
      // Client-facing stage (owned by client). Fallback to recruiter stage if null.
      stage: submission.clientStage || submission.stage,
      clientStage: submission.clientStage,
      recruiterStage: submission.stage,
      sharedBy: submission.submitter?.name || null,
      sharedByEmail: submission.submitter?.email || null,
      sharedAt: (submission.sharedAt || submission.createdAt).toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
      documents,
      myRating,
      allRatings,
      avgRating,
      ratingCount: scores.length,
      comments,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
