import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

// Lets a stub Client (created via Google OAuth self-signup or
// quick-invite that hasn't been activated yet) fill in real company
// info from the dashboard banner instead of being forced through a
// hard-gate onboarding page.
//
// Auth: any logged-in ClientUser of the stub Client can do this.
// Once `isStub` flips to false this endpoint becomes a no-op for
// guarding accidental name overwrites — the recruiter using
// /clients/[id] PUT remains the regular path for renames.
export async function PATCH(request: Request) {
  try {
    const ctx = await getClientContext();
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const industry = typeof body.industry === "string" ? body.industry.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const current = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { isStub: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!current.isStub) {
      // Already onboarded — refuse silently rather than letting the
      // banner overwrite a curated company name.
      return NextResponse.json({ error: "Already onboarded" }, { status: 409 });
    }

    await prisma.client.update({
      where: { id: ctx.clientId },
      data: {
        name,
        industry: industry || null,
        isStub: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
