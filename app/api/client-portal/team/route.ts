import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { randomBytes } from "crypto";
import { sendClientTeamInviteEmail } from "@/lib/email";

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
        title: true,
        role: true,
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

// Invite a new team member (admin only)
export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();

    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can invite team members" }, { status: 403 });
    }

    const body = await request.json();

    if (!body.email || !body.name) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const name = body.name.trim();
    const title = body.title?.trim() || null;
    const role: "ADMIN" | "USER" = body.role === "ADMIN" ? "ADMIN" : "USER";

    // Check if user already exists for this client
    const existing = await prisma.clientUser.findFirst({
      where: { email, clientId: ctx.clientId },
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json({ error: "A team member with this email already exists" }, { status: 409 });
      }
      await prisma.clientUser.update({
        where: { id: existing.id },
        data: { isActive: true, name, title, role },
      });
      return NextResponse.json({ id: existing.id, reactivated: true }, { status: 200 });
    }

    // Create the user (no password yet — they'll set it via token)
    const clientUser = await prisma.clientUser.create({
      data: { email, name, title, role, clientId: ctx.clientId },
    });

    // Create a token so the new user can set their password
    const token = randomBytes(32).toString("hex");
    await prisma.clientPortalToken.create({
      data: {
        token,
        clientId: ctx.clientId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const inviteLink = `${baseUrl}/client-portal/set-password?token=${token}&email=${encodeURIComponent(email)}`;

    // Send invitation email
    const client = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { name: true },
    });

    try {
      await sendClientTeamInviteEmail({
        to: email,
        inviteUrl: inviteLink,
        inviterName: ctx.clientName || "Your colleague",
        companyName: client?.name || "your company",
        memberName: name,
        title: title || undefined,
      });
    } catch (emailErr) {
      console.error("[team/POST] Failed to send invite email:", emailErr);
    }

    return NextResponse.json({
      id: clientUser.id,
      inviteLink,
      emailSent: true,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
