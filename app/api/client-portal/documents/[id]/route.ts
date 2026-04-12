import { NextResponse } from "next/server";
import { getDownloadUrl } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { validateClientPortalToken } from "@/lib/tokens";

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

    // Find the document and verify it belongs to a candidate shared with this client
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
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const downloadUrl = getDownloadUrl(document.url);
    return NextResponse.redirect(downloadUrl);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
