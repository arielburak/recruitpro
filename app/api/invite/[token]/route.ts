import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendInviteAcceptedEmail, sendStaffingMemberWelcomeEmail } from "@/lib/email";
import { safeErrorMessage } from "@/lib/safe-error";
import { recalculateAndSyncSeats } from "@/lib/sync-stripe-seats";

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

    const org = await prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true },
    });

    // Si ya fue usado: NO es error — el caso natural es "ya acepté
    // antes y vuelvo al link viejo". Devolvemos 200 con
    // alreadyAccepted=true para que el frontend redirija al login con
    // el email pre-cargado y un toast amigable, en vez del dead-end
    // "Invalid Invitation".
    if (invite.usedAt) {
      return NextResponse.json({
        alreadyAccepted: true,
        email: invite.email,
        organizationName: org?.name || "the team",
      });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      email: invite.email,
      name: invite.name || "",
      role: invite.role,
      organizationName: org?.name || "Unknown",
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// POST - accept invite and create user
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const name = body.name;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const password = body.password;

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
          title: title || null,
          passwordHash,
          role: invite.role === "ADMIN" ? "ADMIN" : "USER",
          organizationId: invite.organizationId,
          // Accepting the invite from the inbox already proves the
          // address. Mirrors the client-portal /set-password flow
          // which also marks emailVerifiedAt on completion. Without
          // this, invited members landed on /login and bounced off
          // the EMAIL_NOT_VERIFIED hard-block (now a soft-block,
          // but the in-app banner is still noise they don't need).
          emailVerifiedAt: new Date(),
        },
      }),
      prisma.userInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Recalcular seats + sync con Stripe. Sin esto, Stripe seguía
    // cobrando el quantity original del checkout aunque el equipo
    // creciera con invites aceptados.
    void recalculateAndSyncSeats(invite.organizationId);

    // Memoria total (2026-06-17): si el mismo email tambien recibio un
    // PendingFirmInvite (un cliente lo invito a una busqueda especifica
    // del lado client portal), materializarlo a FirmEngagement ahora.
    // Sin esto, el invited terminaba en la org del UserInvite pero las
    // engagement del cliente quedaban huerfanas, y solo se materializaban
    // si el user entraba a /engagements (red de seguridad). El sistema
    // tiene que tener memoria sin importar que flow uses para entrar.
    try {
      const { processPendingInvites } = await import("@/lib/process-pending-invites");
      await processPendingInvites(invite.email, invite.organizationId, user.id);
    } catch (err) {
      console.error("[invite accept] processPendingInvites failed:", err);
    }

    // Welcome mail — symmetric to the client-portal set-password
    // flow. The invite mail asked the member to click and pick a
    // password; this one closes the loop with "your account is
    // live". Without it the member is auto-verified but never sees
    // an explicit "verified" confirmation in their inbox. Fire-and-
    // forget so a Resend hiccup doesn't fail the accept.
    try {
      const org = await prisma.organization.findUnique({
        where: { id: invite.organizationId },
        select: { name: true },
      });
      // NEXTAUTH_URL primero (canonical). Ver comentario en
      // /api/auth/register.
      const origin =
        process.env.NEXTAUTH_URL ||
        request.headers.get("origin") ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
      sendStaffingMemberWelcomeEmail({
        to: invite.email,
        recipientName: name,
        organizationName: org?.name || "your workspace",
        appUrl: `${origin}/login`,
      }).catch((err) =>
        console.error("[invite accept] welcome mail failed:", err),
      );

      // Notif al inviter — cierre del loop "le mande un invite, ¿se
      // subió?". (a) in-app UserNotification para que vea el toque de
      // campana al instante; (b) email para que se entere aunque no
      // este logueado. Skipeable: invites pre-2026-06-17 no tienen
      // invitedById, en ese caso no hay a quien avisar.
      if (invite.invitedById) {
        const inviter = await prisma.user.findUnique({
          where: { id: invite.invitedById },
          select: { id: true, email: true, name: true, isActive: true },
        });
        if (inviter?.isActive) {
          // In-app notif. type "team_member_joined" es nuevo — el bell
          // ya renderea cualquier UserNotification con title + body
          // sin gate por type, asi no hay UI extra.
          await prisma.userNotification
            .create({
              data: {
                userId: inviter.id,
                type: "team_member_joined",
                title: `${name} joined your team`,
                body: `${invite.email} accepted your invitation to ${org?.name || "the team"}.`,
                link: "/settings/team",
              },
            })
            .catch((err) =>
              console.error("[invite accept] inviter notif failed:", err),
            );
          // Email al inviter.
          sendInviteAcceptedEmail({
            to: inviter.email,
            inviterName: inviter.name,
            newMemberName: name,
            newMemberEmail: invite.email,
            organizationName: org?.name || "your workspace",
            teamUrl: `${origin}/settings/team`,
          }).catch((err) =>
            console.error("[invite accept] inviter email failed:", err),
          );
        }
      }
    } catch (err) {
      console.error("[invite accept] welcome mail dispatch failed:", err);
    }

    return NextResponse.json(
      { success: true, userId: user.id },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
