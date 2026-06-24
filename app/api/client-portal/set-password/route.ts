import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendClientPortalWelcomeEmail } from "@/lib/email";
import { safeErrorMessage } from "@/lib/safe-error";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

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

    // Pre-fill name + title on the form when we already have something
    // from the invite — the recruiter usually types in the contact's
    // full name (and sometimes title) when sending the invite, so the
    // hiring contact only has to confirm. Falls back to a blank input
    // when only the email was provided.
    const clientUser = await prisma.clientUser.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        clientId: tokenRecord.clientId,
        isActive: true,
      },
      select: { name: true, title: true },
    });

    return NextResponse.json({
      isStub: tokenRecord.client.isStub,
      currentName: tokenRecord.client.name,
      currentIndustry: tokenRecord.client.industry || "",
      currentUserName: clientUser?.name || "",
      currentUserTitle: clientUser?.title || "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const rl = await checkRateLimit("auth:reset-password", getClientIp(request));
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const {
      token,
      email: rawEmail,
      password,
      companyName,
      industry,
      userName: rawUserName,
      userTitle: rawUserTitle,
    } = await request.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const userName = typeof rawUserName === "string" ? rawUserName.trim() : "";
    const userTitle = typeof rawUserTitle === "string" ? rawUserTitle.trim() : "";

    if (!token || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!userName) {
      return NextResponse.json({ error: "Your full name is required" }, { status: 400 });
    }
    if (!userTitle) {
      return NextResponse.json({ error: "Your role is required" }, { status: 400 });
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
        data: {
          passwordHash,
          // Stamp name + title from the form. These are required by
          // the POST validator above, so we always have a real value
          // here — the page may pre-fill from the invite payload but
          // the hiring contact can correct anything before submit.
          name: userName,
          title: userTitle,
          // Possession of the email-delivered token is proof of mailbox
          // ownership, so stamp the verified-at here. The login flow's
          // hard-block on unverified accounts would otherwise lock the
          // user out on their very first sign-in.
          emailVerifiedAt: clientUser.emailVerifiedAt ?? new Date(),
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
        },
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

    // Confirmation mail: the invite mail asked them to click; now
    // we tell them "your account is live, here's how to come back".
    // Fire-and-forget — a Resend hiccup shouldn't fail a flow the
    // user just succeeded at. Skipped silently if anything's missing.
    try {
      // NEXTAUTH_URL primero (canonical). Ver comentario en
      // /api/auth/register.
      const origin =
        process.env.NEXTAUTH_URL ||
        request.headers.get("origin") ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
      const client = await prisma.client.findUnique({
        where: { id: tokenRecord.clientId },
        select: { name: true },
      });
      sendClientPortalWelcomeEmail({
        to: email,
        recipientName: userName,
        clientName: client?.name ?? null,
        portalUrl: `${origin}/client-portal/login`,
      }).catch((err) =>
        console.error("[set-password] welcome mail failed:", err),
      );
    } catch (err) {
      console.error("[set-password] welcome mail dispatch failed:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
