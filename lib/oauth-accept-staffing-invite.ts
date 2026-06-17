// Cuando un user invitado al ATS hace su primer sign-in via Google OAuth
// (en vez de clickear el link del mail), antes de tratarlo como "signup
// nuevo" y crearle una org vacía, hay que chequear si hay un UserInvite
// pendiente para su email y procesarlo. Si no se hace, el invite queda
// huérfano y el user termina en una nueva org "Sin nombre — completá
// company name", que es exactamente lo opuesto a lo que el inviter
// quería.
//
// Reportado 2026-06-17: invitamos cuello.nico@gmail.com a Morabits,
// el user hizo Sign in with Google y le pidió company name.

import { prisma } from "@/lib/prisma";

// Mismo patrón canonical de canonicalizeGmail / findStaffingUserByOAuthEmail
// en auth-options.ts. Duplicado a propósito para que el módulo sea
// auto-contenido y no introduzca un import cíclico.
function canonicalizeGmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const [local, domain] = lower.split("@");
  if (!local || !domain) return lower;
  if (domain !== "gmail.com" && domain !== "googlemail.com") return lower;
  const cleaned = local.split("+")[0].replace(/\./g, "");
  return `${cleaned}@gmail.com`;
}

type PendingInvite = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  organizationId: string;
  invitedById: string | null;
};

// Busca el UserInvite vigente (sin usar + no expirado) que matchee este
// email, tolerante a alias Gmail. Si Google nos pasa "cuellonico@gmail.com"
// y el invite se creó como "cuello.nico@gmail.com", igual matchea.
export async function findPendingStaffingInviteByOAuthEmail(
  email: string,
): Promise<PendingInvite | null> {
  const now = new Date();

  // 1. Match directo por email exacto
  const exact = await prisma.userInvite.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organizationId: true,
      invitedById: true,
    },
  });
  if (exact) return exact as PendingInvite;

  // 2. Fallback canonical solo para gmail.com / googlemail.com
  const domain = email.toLowerCase().split("@")[1] || "";
  if (domain !== "gmail.com" && domain !== "googlemail.com") return null;
  const canonical = canonicalizeGmail(email);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "UserInvite"
    WHERE "usedAt" IS NULL
      AND "expiresAt" > ${now}
      AND LOWER(SPLIT_PART(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
      AND LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(email, '@', 1), '+', 1), '[.]', '', 'g')) || '@gmail.com' = ${canonical}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return (await prisma.userInvite.findUnique({
    where: { id: rows[0].id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organizationId: true,
      invitedById: true,
    },
  })) as PendingInvite | null;
}

// Procesa la aceptación del invite cuando llega via OAuth. Mismo
// efecto que el POST /api/invite/[token]: crea User en la org del
// invite, marca usedAt, increment seats, dispara welcome mail + notif
// al inviter. Diferencias con el path manual:
//   · passwordHash = "" (OAuth no usa password)
//   · title queda null (Google profile no lo provee)
//   · emailVerifiedAt = now (Google ya verificó la dirección)
//
// Idempotente: si el invite ya fue usado entre el find y el accept (race)
// devuelve null sin throw.
export async function acceptStaffingInviteOnOAuth(
  invite: PendingInvite,
  googleProfile: { email: string; name: string | null },
): Promise<{ userId: string } | null> {
  const name = (googleProfile.name || invite.name || "Member").trim();

  let createdUserId: string | null = null;
  try {
    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          // Guardamos el mail que Google nos dio (canonicalizado) para
          // que el lookup posterior con findStaffingUserByOAuthEmail
          // matchee directo, sin pasar por la rama canonical.
          email: googleProfile.email.toLowerCase(),
          name,
          passwordHash: "",
          role: invite.role === "ADMIN" ? "ADMIN" : "USER",
          organizationId: invite.organizationId,
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      }),
      prisma.userInvite.update({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    createdUserId = user.id;
  } catch (err) {
    // P2025 = invite ya fue usado por otra ruta (race) o P2002 = user
    // duplicado. En ambos casos abortamos limpio; el callback de
    // signIn va a hacer fallback al lookup de User normal.
    console.error("[oauth invite accept] transaction failed:", err);
    return null;
  }

  // Increment subscription seats (best effort).
  try {
    await prisma.subscription.update({
      where: { organizationId: invite.organizationId },
      data: { seats: { increment: 1 } },
    });
  } catch {
    // Subscription puede no existir (org sin Stripe wired) — no es fatal
  }

  // Welcome mail + notif al inviter (mismo flow que POST /api/invite/[token]).
  // Fire-and-forget para no bloquear el sign-in si Resend hace timeout.
  void dispatchPostAcceptSideEffects(invite, googleProfile, name);

  return { userId: createdUserId };
}

async function dispatchPostAcceptSideEffects(
  invite: PendingInvite,
  googleProfile: { email: string; name: string | null },
  finalName: string,
) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true },
    });
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const { sendStaffingMemberWelcomeEmail, sendInviteAcceptedEmail } =
      await import("./email");

    sendStaffingMemberWelcomeEmail({
      to: googleProfile.email,
      recipientName: finalName,
      organizationName: org?.name || "your workspace",
      appUrl: `${baseUrl}/dashboard`,
    }).catch((err) =>
      console.error("[oauth invite accept] welcome mail failed:", err),
    );

    if (invite.invitedById) {
      const inviter = await prisma.user.findUnique({
        where: { id: invite.invitedById },
        select: { id: true, email: true, name: true, isActive: true },
      });
      if (inviter?.isActive) {
        await prisma.userNotification
          .create({
            data: {
              userId: inviter.id,
              type: "team_member_joined",
              title: `${finalName} joined your team`,
              body: `${googleProfile.email} accepted your invitation to ${org?.name || "the team"}.`,
              link: "/settings/team",
            },
          })
          .catch((err) =>
            console.error("[oauth invite accept] inviter notif failed:", err),
          );
        sendInviteAcceptedEmail({
          to: inviter.email,
          inviterName: inviter.name,
          newMemberName: finalName,
          newMemberEmail: googleProfile.email,
          organizationName: org?.name || "your workspace",
          teamUrl: `${baseUrl}/settings/team`,
        }).catch((err) =>
          console.error("[oauth invite accept] inviter mail failed:", err),
        );
      }
    }
  } catch (err) {
    console.error(
      "[oauth invite accept] dispatchPostAcceptSideEffects failed:",
      err,
    );
  }
}
