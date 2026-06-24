import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { sendEmailVerificationEmail } from "@/lib/email";
import { findStaffingUserByEmail } from "@/lib/email-canonical";
import { safeErrorMessage } from "@/lib/safe-error";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

// Resend the verification email. Two callers:
//
// 1. Authenticated dashboard banner — uses the JWT to figure out which
//    user is asking; no body required.
// 2. The login page, when sign-in is blocked by EMAIL_NOT_VERIFIED.
//    The user doesn't have a session yet, so they POST { email }
//    instead. We respond with the same shape regardless of whether
//    the address exists so the endpoint can't be used to enumerate
//    accounts.
//
// Already-verified accounts get a 200 noop so the UI doesn't have to
// special-case that race.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const authedUserId = session?.user?.id;

    // Rate limit por IP — cada request manda mail (costo + abuso del
    // inbox del target). 3 por hora. Authed users tampoco se libran:
    // un atacante con session válida podría seguir spammeando.
    const rl = await checkRateLimit("auth:resend-verification", getClientIp(request));
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many resend attempts. Please wait an hour." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    let user: { id: string; name: string; email: string; emailVerifiedAt: Date | null } | null = null;

    if (authedUserId) {
      user = await prisma.user.findUnique({
        where: { id: authedUserId },
        select: { id: true, name: true, email: true, emailVerifiedAt: true },
      });
    } else {
      // Unauthenticated path — accept { email }. Always return success
      // shape to avoid leaking whether an account exists. Audit 2026-06-23:
      // pasamos por findStaffingUserByEmail para tolerar Gmail aliases
      // (sin esto, un user creado con casing distinto al input se perdía).
      const body = await request.json().catch(() => ({}));
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) {
        return NextResponse.json({ success: true });
      }
      const found = await findStaffingUserByEmail(email);
      user = found
        ? {
            id: found.id,
            name: found.name,
            email: found.email,
            emailVerifiedAt: found.emailVerifiedAt,
          }
        : null;
    }

    if (!user) {
      // Anti-enumeration: pretend it worked.
      return NextResponse.json({ success: true });
    }
    if (user.emailVerifiedAt) {
      return NextResponse.json({ alreadyVerified: true });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: expiresAt,
      },
    });

    // NEXTAUTH_URL primero (canonical, seteado en deploy). Ver
    // comentario equivalente en /api/auth/register.
    const origin = process.env.NEXTAUTH_URL || request.headers.get("origin") || "";
    await sendEmailVerificationEmail({
      to: user.email,
      recipientName: user.name,
      verifyUrl: `${origin}/verify-email?token=${token}`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: safeErrorMessage(error) || "Failed to resend" },
      { status: 500 },
    );
  }
}
