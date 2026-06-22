import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import { safeErrorMessage } from "@/lib/safe-error";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

// POST: upload a new organization logo (admin only)
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContextWithActiveSub();
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

    const updated = await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { logo: blob.url },
      select: { updatedAt: true },
    });

    const v = new Date(updated.updatedAt).getTime();
    return NextResponse.json({ url: `/api/organization/logo/image?v=${v}` });
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    console.error("[org logo upload] error:", error);
    return NextResponse.json({ error: safeErrorMessage(error) || "Upload failed" }, { status: 500 });
  }
}

// DELETE: remove the logo (admin only)
export async function DELETE() {
  try {
    const ctx = await getOrgContextWithActiveSub();
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
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// GET: returns whether the organization has a logo uploaded.
// The actual image bytes are served by /api/organization/logo/image.
// We append a cache-busting version query param so the browser refreshes
// when the logo is replaced.
export async function GET() {
  try {
    const ctx = await getOrgContext();
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { logo: true, name: true, updatedAt: true },
    });

    const hasLogo = !!org?.logo;
    const v = org?.updatedAt ? new Date(org.updatedAt).getTime() : 0;
    const imageUrl = hasLogo ? `/api/organization/logo/image?v=${v}` : null;

    return NextResponse.json({ logo: imageUrl, name: org?.name || null });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
