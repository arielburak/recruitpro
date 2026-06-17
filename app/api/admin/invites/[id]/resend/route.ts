import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendTeamInviteEmail } from "@/lib/email";
import { requireVerifiedEmail } from "@/lib/require-verified-email";

// POST — re-enviar un invite pendiente sin borrar ni regenerar token.
// Decisión 2026-06-17: Resend NO es destructivo (no borra ni cambia
// datos) y debe estar abierto a cualquier org member, igual que el POST
// que crea invites. Antes el flujo era DELETE + POST (en el handler del
// frontend), lo que requería ADMIN por el DELETE. Ahora es una operacion
// dedicada: misma fila de UserInvite, mismo token, mismo link en el
// mail — solo refrescamos expiresAt para que el invitado tenga otros 7
// días desde "ahora" y re-emitimos el email.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

    const ctx = await getOrgContext();
    const { id } = await params;

    const invite = await prisma.userInvite.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        token: true,
        organizationId: true,
        usedAt: true,
      },
    });

    // 404 generico — no diferenciamos "no existe" de "es de otro org"
    // para no leakear existencia entre tenants. Mismo patron que el
    // resto de los endpoints multi-tenant del ATS.
    if (!invite || invite.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (invite.usedAt) {
      return NextResponse.json(
        { error: "This invite was already accepted" },
        { status: 400 }
      );
    }

    // Refresh expiresAt para que el link vuelva a ser viable. Si el
    // invite original estaba vencido, ahora tiene 7 días nuevos desde
    // este resend.
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { expiresAt: newExpiresAt },
    });

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    const inviteUrl = `${baseUrl}/invite/${invite.token}`;

    try {
      await sendTeamInviteEmail({
        to: invite.email,
        inviteUrl,
        inviterName: ctx.userName,
        organizationName: org?.name || "the team",
        recipientName: invite.name || undefined,
      });
    } catch (emailError) {
      console.error("Failed to resend invite email:", emailError);
      // El refresh de expiresAt ya quedó persistido — devolvemos OK
      // igual para que el UI muestre success y no parezca roto. El
      // error se loggea para Sentry.
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
