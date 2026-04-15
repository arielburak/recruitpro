import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { randomBytes } from "crypto";

// List all team members for this client
export async function GET() {
  try {
    const ctx = await getClientContext();

    const members = await prisma.clientUser.findMany({
      where: { clientId: ctx.clientId },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(members);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

// Invite a new team member
export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    const body = await request.json();

    if (!body.email || !body.name) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const name = body.name.trim();

    // Check if user already exists for this client
    const existing = await prisma.clientUser.findFirst({
      where: { email, clientId: ctx.clientId },
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json({ error: "A team member with this email already exists" }, { status: 409 });
      }
      // Reactivate deactivated user
      await prisma.clientUser.update({
        where: { id: existing.id },
        data: { isActive: true, name },
      });
      return NextResponse.json({ id: existing.id, reactivated: true }, { status: 200 });
    }

    // Create the user (no password yet — they'll set it via token)
    const clientUser = await prisma.clientUser.create({
      data: {
        email,
        name,
        clientId: ctx.clientId,
      },
    });

    // Create a token so the new user can set their password
    const token = randomBytes(32).toString("hex");
    await prisma.clientPortalToken.create({
      data: {
        token,
        clientId: ctx.clientId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // TODO: Send invitation email with the set-password link
    // For now, return the token so the UI can show the invite link
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const inviteLink = `${baseUrl}/client-portal/set-password?token=${token}&email=${encodeURIComponent(email)}`;

    return NextResponse.json({
      id: clientUser.id,
      inviteLink,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
