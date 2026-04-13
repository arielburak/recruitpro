import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { token, email, password } = await request.json();

    if (!token || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Validate the token
    const tokenRecord = await prisma.clientPortalToken.findUnique({
      where: { token },
    });

    if (!tokenRecord || !tokenRecord.isActive) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired. Please ask your recruiter to resend." }, { status: 400 });
    }

    // Find the client user
    const clientUser = await prisma.clientUser.findFirst({
      where: { email, clientId: tokenRecord.clientId, isActive: true },
    });

    if (!clientUser) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Set the password
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.clientUser.update({
        where: { id: clientUser.id },
        data: { passwordHash },
      }),
      // Deactivate the token so it can't be reused
      prisma.clientPortalToken.update({
        where: { id: tokenRecord.id },
        data: { isActive: false },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
