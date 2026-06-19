import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { safeErrorMessage } from "@/lib/safe-error";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "File uploads are not configured. Enable Vercel Blob storage in the project settings.",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const candidateId = formData.get("candidateId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (typeof candidateId !== "string" || !candidateId) {
      return NextResponse.json(
        { error: "candidateId is required" },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 10MB limit" },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      );
    }

    // Verify candidate belongs to this org
    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, organizationId: ctx.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Sanitize filename and add a unique prefix
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobPath = `org-${ctx.organizationId}/candidate-${candidateId}/${Date.now()}-${safeName}`;

    const blob = await put(blobPath, file, {
      access: "private",
      addRandomSuffix: false,
    });

    const document = await prisma.document.create({
      data: {
        name: file.name,
        url: blob.url,
        type: file.type,
        size: file.size,
        candidateId,
        uploadedBy: ctx.userId,
      },
    });

    await logActivity({
      action: "document.uploaded",
      description: `${ctx.userName} uploaded ${file.name} to ${candidate.firstName} ${candidate.lastName}`,
      userId: ctx.userId,
      candidateId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(document);
  } catch (error: any) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      { error: safeErrorMessage(error) || "Upload failed" },
      { status: 500 }
    );
  }
}
