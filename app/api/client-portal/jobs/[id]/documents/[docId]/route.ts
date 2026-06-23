import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";
import { safeErrorMessage } from "@/lib/safe-error";

// GET — stream a client-portal job document.
//
// The list endpoint used to return a signed URL from Vercel Blob via
// getDownloadUrl(), but direct fetches against private blobs failed in
// the browser with 403s. We stream through the server instead, mirroring
// what the agency-side /api/documents/[id] does.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id, docId } = await params;

    // Per-JO membership gate. Sin este check, un ClientUser del mismo
    // cliente NO miembro del JO podía stremear los bytes (incluyendo
    // PDF de Job Description) con solo conocer el docId. Audit 2026-06-23.
    const doc = await prisma.document.findFirst({
      where: {
        id: docId,
        clientJobId: id,
        clientJob: { clientId: ctx.clientId },
      },
      select: {
        url: true,
        name: true,
        clientJob: {
          select: {
            clientId: true,
            members: { select: { clientUserId: true } },
          },
        },
      },
    });

    if (!doc || !doc.clientJob || !canAccessClientJob(ctx, doc.clientJob)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    console.error("[client-portal job doc] download error:", error);
    return NextResponse.json(
      { error: safeErrorMessage(error) || "Download failed" },
      { status: 500 }
    );
  }
}
