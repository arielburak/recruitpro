import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { randomBytes } from "crypto";
import { sendClientTeamInviteEmail } from "@/lib/email";
import { roleForNewClientUser } from "@/lib/client-portal-roles";
import { requireVerifiedEmail } from "@/lib/require-verified-email";
import { safeErrorMessage } from "@/lib/safe-error";

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
        passwordHash: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Strip the hash itself, expose only whether the invite was accepted.
    const sanitized = members.map(({ passwordHash, ...m }) => ({
      ...m,
      hasPassword: !!passwordHash,
    }));

    return NextResponse.json(sanitized);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

// Invite a new team member. Open to any client portal user (not just
// ADMIN) so a USER can pull in a teammate without escalating to an
// admin first. Two guards keep this from being a self-service hole:
//   1. Domain match — the invitee's email domain must equal the
//      inviter's. So someone @lionpointpartners.com can only invite
//      @lionpointpartners.com.
//   2. Only ADMINs can grant the ADMIN role; USER invites get role
//      USER regardless of what they send in the body.
export async function POST(request: Request) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

    const ctx = await getClientContext();

    const body = await request.json();

    if (!body.email || !body.name) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const name = body.name.trim();
    const title = body.title?.trim() || null;

    // Domain match. The inviter's email lives on their ClientUser
    // row; we fetch it instead of trusting ctx, since ctx is just
    // the JWT projection and might not carry email today.
    const inviter = await prisma.clientUser.findUnique({
      where: { id: ctx.clientUserId },
      select: { email: true },
    });
    const inviterDomain = inviter?.email?.split("@")[1]?.toLowerCase();
    const inviteeDomain = email.split("@")[1]?.toLowerCase();
    if (!inviterDomain || !inviteeDomain || inviterDomain !== inviteeDomain) {
      return NextResponse.json(
        {
          error: `You can only invite teammates at @${inviterDomain || "your company"}. To invite someone with a different email domain, ask an admin.`,
        },
        { status: 403 }
      );
    }

    // Only ADMINs can grant the ADMIN role. Anyone else's role
    // selection silently becomes USER — no surprise privilege
    // escalation via a crafted payload. The helper below upgrades
    // USER → ADMIN automatically when the client currently has no
    // active admin, so a team that ends up admin-less still boots
    // back into a managed state on the next invite.
    const requestedRole: "ADMIN" | "USER" =
      ctx.role === "ADMIN" && body.role === "ADMIN" ? "ADMIN" : "USER";
    const role = await roleForNewClientUser(prisma, ctx.clientId, requestedRole);

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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
