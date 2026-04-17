import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

// POST: upload a new client logo (admin only)
export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
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

    const existing = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { logo: true },
    });
    if (existing?.logo) {
      try { await del(existing.logo); } catch (e) { console.error("[client logo] delete old blob failed:", e); }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1] || "png";
    const blobPath = `client-${ctx.clientId}/logo-${Date.now()}.${ext}`;
    const blob = await put(blobPath, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type,
    });

    await prisma.client.update({
      where: { id: ctx.clientId },
      data: { logo: blob.url },
    });

    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error("[client logo upload] error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}

// DELETE: remove the logo (admin only)
export async function DELETE() {
  try {
    const ctx = await getClientContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can change the logo" }, { status: 403 });
    }

    const client = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { logo: true },
    });
    if (client?.logo) {
      try { await del(client.logo); } catch (e) { console.error("[client logo] delete blob failed:", e); }
    }
    await prisma.client.update({
      where: { id: ctx.clientId },
      data: { logo: null },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: return current logo url (any active client user)
export async function GET() {
  try {
    const ctx = await getClientContext();
    const client = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { logo: true, name: true },
    });
    return NextResponse.json({ logo: client?.logo || null, name: client?.name || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
