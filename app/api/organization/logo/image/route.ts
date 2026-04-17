import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Streams the organization's logo as a rendered image. Used by <img src>.
// Blobs are private, so we fetch them server-side and pipe the bytes back.
export async function GET() {
  try {
    const ctx = await getOrgContext();
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { logo: true },
    });

    if (!org?.logo) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Fetch blob metadata (contentType) then download via its URL with the token
    let contentType = "image/png";
    try {
      const meta = await head(org.logo);
      if (meta?.contentType) contentType = meta.contentType;
    } catch {
      // fallback
    }

    const res = await fetch(org.logo, {
      headers: process.env.BLOB_READ_WRITE_TOKEN
        ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
        : {},
    });
    if (!res.ok) {
      return new NextResponse("Failed to fetch", { status: res.status });
    }

    const bytes = await res.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
