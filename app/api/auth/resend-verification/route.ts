import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { sendEmailVerificationEmail } from "@/lib/email";

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

    let user: { id: string; name: string; email: string; emailVerifiedAt: Date | null } | null = null;

    if (authedUserId) {
      user = await prisma.user.findUnique({
        where: { id: authedUserId },
        select: { id: true, name: true, email: true, emailVerifiedAt: true },
      });
    } else {
      // Unauthenticated path — accept { email }. Always return success
      // shape to avoid leaking whether an account exists.
      const body = await request.json().catch(() => ({}));
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) {
        return NextResponse.json({ success: true });
      }
      user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, emailVerifiedAt: true },
      });
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

    const origin = request.headers.get("origin") || process.env.NEXTAUTH_URL || "";
    await sendEmailVerificationEmail({
      to: user.email,
      recipientName: user.name,
      verifyUrl: `${origin}/verify-email?token=${token}`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to resend" },
      { status: 500 },
    );
  }
}
