import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // In production, send an actual email with the reset token.
      // For now, log the token to the console.
      const resetToken = crypto.randomBytes(32).toString("hex");
      console.log(
        `[Password Reset] Token for ${email}: ${resetToken}`
      );
      console.log(
        `[Password Reset] Link: ${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`
      );
      // TODO: Store token in DB and send email via SendGrid/Resend/etc.
    }

    return NextResponse.json({ message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
