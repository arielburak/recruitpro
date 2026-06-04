import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendStaffingMemberWelcomeEmail } from "@/lib/email";

// Marks the user as verified when the token from the verification
// email is presented. Public endpoint — the only auth required is
// possession of the token. Idempotent: an already-verified token
// just returns 200 instead of failing, so a recruiter who clicks
// the link twice doesn't see an error.
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

    // No matching token. Could be an already-used link (we clear the
    // token after success) or a forged one — same generic error so
    // we don't leak which. `reason` lets the UI distinguish "this
    // link was already used / regenerated" from "this link timed
    // out", which need different recovery paths (sign in vs resend).
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

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    // Welcome mail — sent on the FIRST successful verification only
    // (the alreadyVerified branch above short-circuits before this
    // update runs, so double-clicks don't double-send). Symmetric
    // with the invite/set-password and OAuth flows so every account-
    // activation path produces the same "your account is ready"
    // confirmation in the inbox.
    try {
      const origin =
        request.headers.get("origin") ||
        process.env.NEXTAUTH_URL ||
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
      { error: error.message || "Verification failed" },
      { status: 500 },
    );
  }
}
