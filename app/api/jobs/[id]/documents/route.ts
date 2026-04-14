import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

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
    const ctx = await getOrgContext();
    const { id } = await params;

    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const documents = await prisma.document.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(documents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "File uploads are not configured. Enable Vercel Blob storage in the project settings." },
        { status: 500 }
      );
    }

    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, title: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const category = formData.get("category") as string;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!category || !["JOB_DESCRIPTION", "ADDITIONAL"].includes(category)) {
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
        where: { jobId: id, category: "JOB_DESCRIPTION" },
      });
      if (existing) {
        try { await del(existing.url); } catch (e) { console.error("[job doc] blob delete failed:", e); }
        await prisma.document.delete({ where: { id: existing.id } });
      }
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobPath = `org-${ctx.organizationId}/job-${id}/${Date.now()}-${safeName}`;

    const blob = await put(blobPath, file, {
      access: "private",
      addRandomSuffix: false,
    });

    // Parse text from JD files and save to job.description
    if (category === "JOB_DESCRIPTION") {
      let parsedText = "";
      try {
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith(".pdf")) {
          const pdfParse = require("pdf-parse");
          const buffer = Buffer.from(await file.arrayBuffer());
          const pdfData = await pdfParse(buffer);
          parsedText = pdfData.text;
        } else if (fileName.endsWith(".docx")) {
          const mammoth = require("mammoth");
          const buffer = Buffer.from(await file.arrayBuffer());
          const result = await mammoth.extractRawText({ buffer });
          parsedText = result.value;
        } else {
          // .txt, .doc, or other text-based formats
          parsedText = await file.text();
        }
      } catch (parseError) {
        console.error("[job doc] text extraction failed:", parseError);
      }

      if (parsedText.trim()) {
        await prisma.job.update({
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
        jobId: id,
        uploadedBy: ctx.userId,
      },
    });

    await logActivity({
      action: "document.uploaded",
      description: `${ctx.userName} uploaded ${file.name} to job ${job.title}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(document);
  } catch (error: any) {
    console.error("Job document upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
