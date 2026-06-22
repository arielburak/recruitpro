import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

const TOKEN_TTL_MINUTES = 60;

export async function POST(request: Request) {
  try {
    const { email, isClient } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Always return success to prevent email enumeration
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    if (isClient) {
      // Client user forgot password
      const clientUser = await prisma.clientUser.findFirst({
        where: { email, isActive: true },
      });

      if (clientUser) {
        // Invalidate prior tokens
        await prisma.passwordResetToken.deleteMany({
          where: { clientUserId: clientUser.id, usedAt: null },
        });

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

        await prisma.passwordResetToken.create({
          data: { token, clientUserId: clientUser.id, expiresAt },
        });

        const resetUrl = `${baseUrl}/client-portal/reset-password?token=${token}`;

        try {
          await sendPasswordResetEmail({
            to: clientUser.email,
            resetUrl,
            recipientName: clientUser.name,
          });
        } catch (sendError) {
          console.error("[forgot-password-client] Failed to send email:", sendError);
        }
      }
    } else {
      // Recruiter user forgot password (existing flow).
      // QA HIGH #12: el path de ClientUser arriba filtra isActive: true
      // pero acá NO lo hacía — un recruiter deactivated recibía el
      // email de reset y podía mutar passwordHash de una row supuesta-
      // mente muerta. El sign-in posterior lo bloquea (authorize
      // throw DEACTIVATED) pero igual mejor cerrar el flow desde el
      // principio. Parity rule: si filtro en client, filtro en
      // staffing. Memoria feedback_consistent_filters.
      const user = await prisma.user.findFirst({
        where: { email, isActive: true },
      });

      if (user) {
        await prisma.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        });

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

        await prisma.passwordResetToken.create({
          data: { token, userId: user.id, expiresAt },
        });

        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        try {
          await sendPasswordResetEmail({
            to: user.email,
            resetUrl,
            recipientName: user.name,
          });
        } catch (sendError) {
          console.error("[forgot-password] Failed to send email:", sendError);
        }
      }
    }

    return NextResponse.json({
      message: "If that email exists, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
