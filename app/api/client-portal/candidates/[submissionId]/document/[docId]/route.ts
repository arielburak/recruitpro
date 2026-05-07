import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// GET — stream a candidate document to the client portal user.
//
// Earlier versions redirected to a signed blob URL, but private-access
// blobs can't be fetched by the browser directly — the redirect ended
// up as a download-that-never-downloads. We now proxy the bytes through
// the server like /api/documents/[id] does for the agency side.
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

    const doc = await prisma.document.findFirst({
      where: {
        id: docId,
        candidateId: submission.candidateId,
      },
      select: { url: true, name: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const blobResult = await get(doc.url, { access: "private" });

    if (!blobResult || blobResult.statusCode === 304) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 });
    }

    return new NextResponse(blobResult.stream, {
      status: 200,
      headers: {
        "Content-Type": blobResult.blob.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.name)}"`,
        "Content-Length": blobResult.blob.size.toString(),
      },
    });
  } catch (error: any) {
    console.error("[client-portal candidate doc] download error:", error);
    return NextResponse.json(
      { error: error.message || "Download failed" },
      { status: 500 }
    );
  }
}
