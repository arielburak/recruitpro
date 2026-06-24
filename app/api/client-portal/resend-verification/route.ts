import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailVerificationEmail } from "@/lib/email";
import { safeErrorMessage } from "@/lib/safe-error";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

// Re-issue a fresh verification token for a portal user who hasn't
// clicked the original yet. Public on purpose — the login page hits
// this when bcrypt validates but emailVerifiedAt is null, so the user
// can recover from a lost / expired link without help. Generic
// success response either way so we don't leak which addresses exist.
export async function POST(request: Request) {
  try {
    const rl = await checkRateLimit("auth:resend-verification", getClientIp(request));
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many resend attempts. Please wait an hour." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const user = await prisma.clientUser.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, emailVerifiedAt: true, passwordHash: true },
    });

    // Generic ok for non-existent / already-verified / oauth-only
    // accounts so this endpoint can't be used to enumerate emails.
    if (!user || user.emailVerifiedAt || !user.passwordHash) {
      return NextResponse.json({ ok: true });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.clientUser.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: expiresAt,
      },
    });

    // NEXTAUTH_URL primero (canonical). Ver comentario en
    // /api/auth/register.
    const origin = process.env.NEXTAUTH_URL || request.headers.get("origin") || "";
    sendEmailVerificationEmail({
      to: user.email,
      recipientName: user.name,
      verifyUrl: `${origin}/client-portal/verify-email?token=${token}`,
    }).catch((err) => console.error("[client-resend-verification] mail failed:", err));

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
