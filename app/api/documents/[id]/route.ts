import { NextResponse } from "next/server";
import { del, get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        OR: [
          { candidate: { organizationId: ctx.organizationId } },
          { job: { organizationId: ctx.organizationId } },
          { deal: { organizationId: ctx.organizationId } },
        ],
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Stream private blob content through our server
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
    console.error("[document download] error:", error);
    return NextResponse.json(
      { error: error.message || "Download failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Confirm the document belongs to this org (via candidate or job)
    const document = await prisma.document.findFirst({
      where: {
        id,
        OR: [
          { candidate: { organizationId: ctx.organizationId } },
          { job: { organizationId: ctx.organizationId } },
          { deal: { organizationId: ctx.organizationId } },
        ],
      },
      include: {
        candidate: { select: { firstName: true, lastName: true, id: true } },
        job: { select: { title: true, id: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Best-effort delete from blob storage
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await del(document.url);
      }
    } catch (blobError) {
      console.error("[document delete] blob removal failed:", blobError);
    }

    await prisma.document.delete({ where: { id } });

    const description = document.candidate
      ? `${ctx.userName} deleted ${document.name} from ${document.candidate.firstName} ${document.candidate.lastName}`
      : `${ctx.userName} deleted ${document.name} from job ${document.job?.title}`;

    await logActivity({
      action: "document.deleted",
      description,
      userId: ctx.userId,
      candidateId: document.candidate?.id,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { error: error.message || "Delete failed" },
      { status: 500 }
    );
  }
}
