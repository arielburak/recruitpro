import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { validateClientPortalToken } from "@/lib/tokens";

// Token-scoped document download for the (legacy) shareable-link client
// portal flow. Same shape as the session-auth candidate doc route: we
// stream the blob through the server instead of redirecting to a signed
// URL, which was silently breaking when the browser tried to fetch a
// private blob.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 401 });
    }

    const tokenRecord = await validateClientPortalToken(token);
    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
    }

    const document = await prisma.document.findFirst({
      where: {
        id,
        candidate: {
          submissions: {
            some: {
              isSharedWithClient: true,
              job: { clientId: tokenRecord.clientId },
            },
          },
        },
      },
      select: { url: true, name: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const blobResult = await get(document.url, { access: "private" });

    if (!blobResult || blobResult.statusCode === 304) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 });
    }

    return new NextResponse(blobResult.stream, {
      status: 200,
      headers: {
        "Content-Type": blobResult.blob.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.name)}"`,
        "Content-Length": blobResult.blob.size.toString(),
      },
    });
  } catch (error: any) {
    console.error("[client-portal doc] download error:", error);
    return NextResponse.json(
      { error: error.message || "Download failed" },
      { status: 500 }
    );
  }
}
