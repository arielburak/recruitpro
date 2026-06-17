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
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
]);

// GET — list attachments on a client. Unlike job documents we don't
// distinguish categories here: everything a recruiter pins on a client
// (master service agreement, W-9, fee schedule, etc.) is just an
// "attachment".
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        engagedOrganizations: { some: { organizationId: ctx.organizationId } },
      },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const documents = await prisma.document.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(documents);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// POST — upload an attachment to a client.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "File uploads are not configured. Enable Vercel Blob storage in the project settings.",
        },
        { status: 500 }
      );
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        engagedOrganizations: { some: { organizationId: ctx.organizationId } },
      },
      select: { id: true, name: true },
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobPath = `org-${ctx.organizationId}/client-${id}/${Date.now()}-${safeName}`;

    const blob = await put(blobPath, fileBuffer, {
      access: "private",
      addRandomSuffix: false,
    });

    const document = await prisma.document.create({
      data: {
        name: file.name,
        url: blob.url,
        type: file.type,
        size: file.size,
        category: "ATTACHMENT",
        clientId: id,
        uploadedBy: ctx.userId,
      },
    });

    await logActivity({
      action: "document.uploaded",
      description: `${ctx.userName} attached ${file.name} to client ${client.name}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(document);
  } catch (error: any) {
    console.error("Client attachment upload error:", error);
    return NextResponse.json(
      { error: safeErrorMessage(error) || "Upload failed" },
      { status: 500 }
    );
  }
}
