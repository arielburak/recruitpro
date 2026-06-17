import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendClientPortalWelcomeEmail } from "@/lib/email";
import { safeErrorMessage } from "@/lib/safe-error";

// Marks a ClientUser as verified when the token from the verification
// email is presented. Mirror of /api/auth/verify-email on the agency
// side — public endpoint, idempotent (the token stays on the row so a
// refresh of /client-portal/verify-email returns alreadyVerified
// instead of "link no longer valid"), generic error message so a
// forged token doesn't leak the difference between "wrong" and
// "superseded by resend".
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const user = await prisma.clientUser.findUnique({
      where: { emailVerificationToken: token },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        emailVerificationExpiresAt: true,
        client: { select: { name: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired verification link", reason: "invalid" },
        { status: 400 }
      );
    }

    if (user.emailVerifiedAt) {
      return NextResponse.json({ alreadyVerified: true });
    }

    if (
      user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "Verification link expired. Request a new one from the sign-in page.", reason: "expired" },
        { status: 400 }
      );
    }

    // Only flip emailVerifiedAt — see /api/auth/verify-email for the
    // full rationale. Short version: leaving the token in place is
    // what keeps a refresh idempotent.
    await prisma.clientUser.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    // Welcome mail. Same rule as the agency side: dispatch on the
    // FIRST successful verification only (alreadyVerified branch
    // returns above, so double-clicks don't double-send). Keeps
    // the welcome experience consistent across signup-manual,
    // invite/set-password, and OAuth.
    try {
      // NEXTAUTH_URL primero (canonical). Ver comentario en
      // /api/auth/register.
      const origin =
        process.env.NEXTAUTH_URL ||
        request.headers.get("origin") ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
      sendClientPortalWelcomeEmail({
        to: user.email,
        recipientName: user.name || "",
        clientName: user.client?.name || null,
        portalUrl: `${origin}/client-portal/login`,
      }).catch((err) =>
        console.error("[client verify-email] welcome mail failed:", err),
      );
    } catch (err) {
      console.error("[client verify-email] welcome mail dispatch failed:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: safeErrorMessage(error) || "Verification failed" },
      { status: 500 }
    );
  }
}
