import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// GET — used by the set-password page to know whether to show the
// "complete your company info" fields. When the underlying Client was
// created via quick-invite (isStub=true), the hiring manager enriches
// it on first login. We return the token's validity and stub status
// without exposing the email/password.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";
    const email = (searchParams.get("email") || "").trim().toLowerCase();

    if (!token || !email) {
      return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    }

    const tokenRecord = await prisma.clientPortalToken.findUnique({
      where: { token },
      include: { client: { select: { id: true, name: true, industry: true, isStub: true } } },
    });

    if (!tokenRecord || !tokenRecord.isActive) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 400 });
    }

    return NextResponse.json({
      isStub: tokenRecord.client.isStub,
      currentName: tokenRecord.client.name,
      currentIndustry: tokenRecord.client.industry || "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { token, email: rawEmail, password, companyName, industry } = await request.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!token || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Validate the token
    const tokenRecord = await prisma.clientPortalToken.findUnique({
      where: { token },
      include: { client: { select: { id: true, isStub: true } } },
    });

    if (!tokenRecord || !tokenRecord.isActive) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired. Please ask your recruiter to resend." }, { status: 400 });
    }

    // Find the client user
    const clientUser = await prisma.clientUser.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        clientId: tokenRecord.clientId,
        isActive: true,
      },
    });

    if (!clientUser) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Stub enrichment: when the Client was created via quick-invite, the
    // hiring manager must give us a real company name (we displayed a
    // placeholder derived from their email domain until now).
    const isStub = tokenRecord.client.isStub;
    const trimmedCompany = typeof companyName === "string" ? companyName.trim() : "";
    if (isStub && !trimmedCompany) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    // Set the password
    const passwordHash = await bcrypt.hash(password, 12);

    const ops: any[] = [
      prisma.clientUser.update({
        where: { id: clientUser.id },
        data: { passwordHash },
      }),
      prisma.clientPortalToken.update({
        where: { id: tokenRecord.id },
        data: { isActive: false },
      }),
    ];

    if (isStub) {
      ops.push(
        prisma.client.update({
          where: { id: tokenRecord.clientId },
          data: {
            name: trimmedCompany,
            industry: typeof industry === "string" && industry.trim() ? industry.trim() : null,
            isStub: false,
          },
        })
      );
    }

    await prisma.$transaction(ops);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
