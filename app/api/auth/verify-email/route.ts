import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendStaffingMemberWelcomeEmail } from "@/lib/email";
import { safeErrorMessage } from "@/lib/safe-error";

// Marks the user as verified when the token from the verification
// email is presented. Public endpoint — the only auth required is
// possession of the token. Idempotent: the token stays on the row
// after verification, so a refresh of /verify-email re-finds the
// user and short-circuits via the alreadyVerified branch instead
// of failing with "link no longer valid". The token is rotated
// (and the old one invalidated) only when a resend explicitly
// requests a new one.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { emailVerificationToken: token },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        emailVerificationExpiresAt: true,
        organization: { select: { name: true } },
      },
    });

    // No matching token. Either the token was rotated by a resend
    // (old link superseded) or it's forged — same generic error so
    // we don't leak which. `reason: "invalid"` lets the UI route to
    // the "already used / superseded" copy (sign in or check inbox
    // for the newest link) instead of the "timed out" copy (resend).
    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired verification link", reason: "invalid" },
        { status: 400 },
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
        { error: "Verification link expired. Request a new one from the dashboard.", reason: "expired" },
        { status: 400 },
      );
    }

    // Only flip emailVerifiedAt. Leaving the token + expiry in place
    // is what makes a refresh of /verify-email idempotent: the next
    // hit finds the same row, sees emailVerifiedAt set, and returns
    // alreadyVerified instead of "link no longer valid". The token
    // is safe to leave because resend rotates it (invalidating this
    // one) and emailVerificationExpiresAt still bounds its lifetime.
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    // Welcome mail — sent on the FIRST successful verification only
    // (the alreadyVerified branch above short-circuits before this
    // update runs, so double-clicks don't double-send). Symmetric
    // with the invite/set-password and OAuth flows so every account-
    // activation path produces the same "your account is ready"
    // confirmation in the inbox.
    try {
      // NEXTAUTH_URL primero (canonical). Ver comentario en
      // /api/auth/register.
      const origin =
        process.env.NEXTAUTH_URL ||
        request.headers.get("origin") ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
      sendStaffingMemberWelcomeEmail({
        to: user.email,
        recipientName: user.name || "",
        organizationName: user.organization?.name || "your workspace",
        appUrl: `${origin}/login`,
      }).catch((err) =>
        console.error("[verify-email] welcome mail failed:", err),
      );
    } catch (err) {
      console.error("[verify-email] welcome mail dispatch failed:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: safeErrorMessage(error) || "Verification failed" },
      { status: 500 },
    );
  }
}
