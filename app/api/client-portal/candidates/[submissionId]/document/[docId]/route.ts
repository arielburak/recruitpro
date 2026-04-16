import { NextResponse } from "next/server";
import { getDownloadUrl } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// GET a signed download URL (redirect) for a candidate document.
// Only allowed if the candidate is shared with this client.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string; docId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { submissionId, docId } = await params;

    // Verify the submission belongs to this client AND is shared
    const submission = await prisma.candidateSubmission.findFirst({
      where: {
        id: submissionId,
        isSharedWithClient: true,
        job: { clientId: ctx.clientId },
      },
      select: { candidateId: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Find the document and verify it belongs to this candidate
    const doc = await prisma.document.findFirst({
      where: {
        id: docId,
        candidateId: submission.candidateId,
      },
      select: { url: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const downloadUrl = getDownloadUrl(doc.url);
    return NextResponse.redirect(downloadUrl);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
