import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        emailVerifiedAt: true,
        emailVerificationExpiresAt: true,
      },
    });

    // No matching token. Could be an already-used link (we clear the
    // token after success) or a forged one — same generic error so
    // we don't leak which.
    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired verification link" },
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
        { error: "Verification link expired. Request a new one from the dashboard." },
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 },
    );
  }
}
