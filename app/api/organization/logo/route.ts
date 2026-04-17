import { NextResponse } from "next/server";
import { put, del, getDownloadUrl } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

// POST: upload a new organization logo (admin only)
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can change the logo" }, { status: 403 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "File uploads are not configured." }, { status: 500 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Logo exceeds 2MB limit" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Use PNG, JPG, WEBP or SVG" }, { status: 400 });
    }

    // Replace existing logo (delete old blob if any)
    const existing = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { logo: true },
    });
    if (existing?.logo) {
      try { await del(existing.logo); } catch (e) { console.error("[org logo] delete old blob failed:", e); }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1] || "png";
    const blobPath = `org-${ctx.organizationId}/logo-${Date.now()}.${ext}`;
    const blob = await put(blobPath, buffer, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type,
    });

    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { logo: blob.url },
    });

    // Return a signed display URL so the browser can render immediately
    let displayUrl = blob.url;
    try { displayUrl = getDownloadUrl(blob.url); } catch {}

    return NextResponse.json({ url: displayUrl });
  } catch (error: any) {
    console.error("[org logo upload] error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}

// DELETE: remove the logo (admin only)
export async function DELETE() {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can change the logo" }, { status: 403 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { logo: true },
    });
    if (org?.logo) {
      try { await del(org.logo); } catch (e) { console.error("[org logo] delete blob failed:", e); }
    }
    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { logo: null },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: return current logo url (anyone in the org).
// Since blobs are private, we return a signed download URL that the browser can render.
export async function GET() {
  try {
    const ctx = await getOrgContext();
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { logo: true, name: true },
    });
    let displayUrl: string | null = null;
    if (org?.logo) {
      try {
        displayUrl = getDownloadUrl(org.logo);
      } catch (e) {
        console.error("[org logo] getDownloadUrl failed:", e);
        displayUrl = org.logo;
      }
    }
    return NextResponse.json({ logo: displayUrl, name: org?.name || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
