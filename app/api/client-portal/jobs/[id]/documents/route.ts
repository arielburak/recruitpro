import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { parseDocumentBuffer } from "@/lib/parse-document";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;

    // Verify the job belongs to this client
    const job = await prisma.clientJob.findFirst({
      where: { id, clientId: ctx.clientId },
      select: { id: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const documents = await prisma.document.findMany({
      where: { clientJobId: id },
      orderBy: { createdAt: "desc" },
    });

    // Blobs are uploaded with `access: "private"`, so the stored `url`
    // returns 403 when hit directly from the browser. Point each row's
    // downloadUrl at our streaming endpoint instead of a signed Vercel
    // Blob URL — signed private-blob URLs were silently failing in the
    // browser.
    const withDownload = documents.map((d) => ({
      ...d,
      downloadUrl: `/api/client-portal/jobs/${id}/documents/${d.id}`,
    }));

    return NextResponse.json(withDownload);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "File uploads are not configured." },
        { status: 500 }
      );
    }

    const job = await prisma.clientJob.findFirst({
      where: { id, clientId: ctx.clientId },
      select: { id: true, title: true, createdByAgency: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.createdByAgency) {
      return NextResponse.json(
        {
          error:
            "Files on this search are managed by your recruiting firm. Ask them to upload or replace the document.",
        },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const category = (formData.get("category") as string) || "ADDITIONAL";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!["JOB_DESCRIPTION", "ADDITIONAL"].includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }

    // If uploading a JD, replace the existing one
    if (category === "JOB_DESCRIPTION") {
      const existing = await prisma.document.findFirst({
        where: { clientJobId: id, category: "JOB_DESCRIPTION" },
      });
      if (existing) {
        try { await del(existing.url); } catch (e) { console.error("[clientjob doc] blob delete failed:", e); }
        await prisma.document.delete({ where: { id: existing.id } });
      }
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobPath = `client-${ctx.clientId}/clientjob-${id}/${Date.now()}-${safeName}`;

    const blob = await put(blobPath, fileBuffer, {
      access: "private",
      addRandomSuffix: false,
    });

    // If uploading a JD, parse the text and update the job's description
    let parsedText = "";
    let parseError = "";
    if (category === "JOB_DESCRIPTION") {
      try {
        parsedText = await parseDocumentBuffer(fileBuffer, file.name);
      } catch (err: any) {
        parseError = err.message || "Unknown parse error";
        console.error("[clientjob doc] text extraction failed:", err);
      }

      if (parsedText.trim()) {
        await prisma.clientJob.update({
          where: { id },
          data: { description: parsedText.trim() },
        });
      }
    }

    const document = await prisma.document.create({
      data: {
        name: file.name,
        url: blob.url,
        type: file.type,
        size: file.size,
        category,
        clientJobId: id,
        uploadedBy: ctx.clientUserId,
      },
    });

    return NextResponse.json({
      ...document,
      parsed: parsedText.trim().length > 0,
      parsedLength: parsedText.trim().length,
      parseError: parseError || undefined,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Client job document upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const url = new URL(request.url);
    const documentId = url.searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json({ error: "documentId required" }, { status: 400 });
    }

    // Verify the job belongs to this client AND isn't an agency-
    // pushed mirror — deleting docs the firm uploaded would feel
    // like sabotage from their side.
    const job = await prisma.clientJob.findFirst({
      where: { id, clientId: ctx.clientId },
      select: { id: true, createdByAgency: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.createdByAgency) {
      return NextResponse.json(
        {
          error:
            "Files on this search are managed by your recruiting firm.",
        },
        { status: 403 }
      );
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, clientJobId: id },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    try { await del(document.url); } catch (e) { console.error("[clientjob doc] blob delete failed:", e); }
    await prisma.document.delete({ where: { id: documentId } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
