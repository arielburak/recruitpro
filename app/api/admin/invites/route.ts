import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendTeamInviteEmail } from "@/lib/email";
import { requireVerifiedEmail } from "@/lib/require-verified-email";
import { safeErrorMessage } from "@/lib/safe-error";

export async function POST(request: Request) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

    const ctx = await getOrgContext();

    const body = await request.json();
    const email = body.email;
    // Cualquier miembro del org puede invitar a un teammate. Decisión 2026-06-17:
    // los invites NO son destructivos y abrirlos a USER baja la fricción del
    // onboarding cuando el admin no esta cerca. La unica restriccion: si quien
    // invita es USER, el invite se crea forzosamente como USER — no puede
    // elevar privilegios a ADMIN. ADMIN sigue siendo el unico que puede
    // sembrar otro ADMIN (y el unico que puede borrar / revocar invites).
    const requestedRole: "ADMIN" | "USER" = body.role === "ADMIN" ? "ADMIN" : "USER";
    const role: "ADMIN" | "USER" = ctx.role === "ADMIN" ? requestedRole : "USER";
    const name = typeof body.name === "string" ? body.name.trim() : null;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user already exists in org
    const existingUser = await prisma.user.findFirst({
      where: { email, organizationId: ctx.organizationId },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists in your organization" },
        { status: 400 }
      );
    }

    // Check for existing pending invite
    const existingInvite = await prisma.userInvite.findFirst({
      where: {
        email,
        organizationId: ctx.organizationId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvite) {
      return NextResponse.json(
        { error: "An invite is already pending for this email" },
        { status: 400 }
      );
    }

    // Create invite. invitedById nos permite notificarle al inviter
    // cuando el invitee acepta. Para invites pre-2026-06-17 el campo es
    // null — no romper backward compat, solo trackeamos hacia adelante.
    const invite = await prisma.userInvite.create({
      data: {
        email,
        role,
        name: name || null,
        organizationId: ctx.organizationId,
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Get org name for email
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });

    // Send invite email
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    const inviteUrl = `${baseUrl}/invite/${invite.token}`;

    try {
      await sendTeamInviteEmail({
        to: email,
        inviteUrl,
        inviterName: ctx.userName,
        organizationName: org?.name || "the team",
        recipientName: name || undefined,
      });
    } catch (emailError) {
      console.error("Failed to send invite email:", emailError);
      // Still return success - invite was created
    }

    return NextResponse.json(
      { success: true, inviteId: invite.id },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// GET - list pending invites
// Open to any authenticated org member so the My Team tab can render
// pending invitations. Mutations (POST/DELETE) remain admin-only.
export async function GET() {
  try {
    const ctx = await getOrgContext();

    const invites = await prisma.userInvite.findMany({
      where: { organizationId: ctx.organizationId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invites);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// DELETE - revoke/cancel a pending invite
export async function DELETE(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { inviteId } = await request.json();

    await prisma.userInvite.delete({
      where: { id: inviteId, organizationId: ctx.organizationId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
