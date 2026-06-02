import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Marks a ClientUser as verified when the token from the verification
// email is presented. Mirror of /api/auth/verify-email on the agency
// side — public endpoint, idempotent, generic error message so a
// forged token doesn't leak the difference between "wrong" and
// "already used".
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
        emailVerifiedAt: true,
        emailVerificationExpiresAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired verification link" },
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
        { error: "Verification link expired. Request a new one from the sign-in page." },
        { status: 400 }
      );
    }

    await prisma.clientUser.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}
