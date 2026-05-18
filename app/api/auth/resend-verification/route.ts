import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendEmailVerificationEmail } from "@/lib/email";

// Rotate the verification token + resend the email for the signed-in
// recruiter. Used by the dashboard banner. Already-verified users get
// a 200 noop so the UI doesn't have to special-case that race.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
      { status: 401 },
    );
  }
}
