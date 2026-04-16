import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET - validate invite and return info
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invite = await prisma.userInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invite.usedAt) {
      return NextResponse.json(
        { error: "This invitation has already been used" },
        { status: 400 }
      );
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 400 }
      );
    }

    // Get org name
    const org = await prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true },
    });

    return NextResponse.json({
      email: invite.email,
      name: invite.name || "",
      role: invite.role,
      organizationName: org?.name || "Unknown",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - accept invite and create user
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { name, password } = await request.json();

    if (!name || !password) {
      return NextResponse.json(
        { error: "Name and password required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const invite = await prisma.userInvite.findUnique({
      where: { token },
    });

    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 400 }
      );
    }

    // Check if user already exists with this email
    const existing = await prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existing) {
      // Mark invite as used
      await prisma.userInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
      return NextResponse.json(
        {
          error:
            "A user with this email already exists. Please sign in instead.",
        },
        { status: 400 }
      );
    }

    // Create user and mark invite as used in a transaction
    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          email: invite.email,
          name,
          passwordHash,
          role: invite.role,
          organizationId: invite.organizationId,
        },
      }),
      prisma.userInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Increment subscription seats
    try {
      await prisma.subscription.update({
        where: { organizationId: invite.organizationId },
        data: { seats: { increment: 1 } },
      });
    } catch {
      // Subscription may not exist yet — non-fatal
    }

    return NextResponse.json(
      { success: true, userId: user.id },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
