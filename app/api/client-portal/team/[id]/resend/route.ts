import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { randomBytes } from "crypto";
import { sendClientTeamInviteEmail } from "@/lib/email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();

    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can resend invites" }, { status: 403 });
    }

    const { id } = await params;

    const member = await prisma.clientUser.findFirst({
      where: { id, clientId: ctx.clientId },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (member.passwordHash) {
      return NextResponse.json(
        { error: "This member already accepted the invite" },
        { status: 400 }
      );
    }

    const token = randomBytes(32).toString("hex");
    await prisma.clientPortalToken.create({
      data: {
        token,
        clientId: ctx.clientId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const inviteLink = `${baseUrl}/client-portal/set-password?token=${token}&email=${encodeURIComponent(member.email)}`;

    const client = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { name: true },
    });

    let emailSent = false;
    try {
      await sendClientTeamInviteEmail({
        to: member.email,
        inviteUrl: inviteLink,
        inviterName: ctx.clientName || "Your colleague",
        companyName: client?.name || "your company",
        memberName: member.name,
        title: member.title || undefined,
      });
      emailSent = true;
    } catch (emailErr) {
      console.error("[team/resend] Failed to send invite email:", emailErr);
    }

    return NextResponse.json({ inviteLink, emailSent });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
