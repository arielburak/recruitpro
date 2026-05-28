import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendClientSetPasswordEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

// Invite a Contact to the client portal, or resend the invite if they
// were already invited but never redeemed the token. State machine:
//
//   no ClientUser yet     → create ClientUser + mint token + send mail
//   ClientUser, pending   → mint a fresh token + send mail (resend)
//   ClientUser, active    → 409 "already a portal user, nothing to do"
//   exists at OTHER Client → 409 "email already taken elsewhere"
//
// The endpoint never grants Job-level access. A portal user invited
// from /contacts can sign in but only sees what's been shared with
// the broader client team — Job-specific access flows through the
// "Invite Client" dialog on the Job page, which is a separate path.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { client: { select: { id: true, name: true } } },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    const email = (contact.email || "").trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { error: "This contact doesn't have a valid email yet — add one first." },
        { status: 400 }
      );
    }

    const existing = await prisma.clientUser.findUnique({
      where: { email },
      select: {
        id: true,
        clientId: true,
        passwordHash: true,
        client: { select: { name: true } },
      },
    });

    // Cross-Client clash. ClientUser.email is globally unique so the
    // same person at another Client can't be re-keyed here. The
    // recruiter sees a useful message instead of a 500.
    if (existing && existing.clientId !== contact.client.id) {
      return NextResponse.json(
        {
          error: `That email already has a portal account at ${existing.client.name}. Use a different address or update the contact.`,
        },
        { status: 409 }
      );
    }

    // Same Client + already redeemed the invite → nothing useful to do
    // from a UI that's calling this endpoint.
    if (existing && existing.passwordHash) {
      return NextResponse.json(
        { error: "This person already has portal access.", alreadyActive: true },
        { status: 409 }
      );
    }

    let clientUser = existing;
    let mode: "invited" | "resent" = "invited";
    const fullName = `${contact.firstName} ${contact.lastName}`.trim() || email;

    if (!clientUser) {
      const created = await prisma.clientUser.create({
        data: {
          email,
          name: fullName,
          title: contact.title,
          clientId: contact.client.id,
          role: "USER",
        },
        select: {
          id: true,
          clientId: true,
          passwordHash: true,
          client: { select: { name: true } },
        },
      });
      clientUser = created;
    } else {
      // Existing pending row — invalidate its older tokens so a re-
      // invite always issues a fresh, unambiguous link.
      await prisma.clientPortalToken.updateMany({
        where: { clientId: clientUser.clientId, isActive: true },
        data: { isActive: false },
      });
      mode = "resent";
    }

    const setPasswordToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.clientPortalToken.create({
      data: {
        token: setPasswordToken,
        clientId: contact.client.id,
        expiresAt,
        isActive: true,
      },
    });

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const setPasswordUrl = `${baseUrl}/client-portal/set-password?token=${setPasswordToken}&email=${encodeURIComponent(email)}`;

    try {
      await sendClientSetPasswordEmail({
        to: email,
        setPasswordUrl,
        clientName: fullName,
      });
    } catch (e) {
      // Non-fatal — the recruiter can re-send from the UI if the SMTP
      // layer is down. The ClientUser row + token are persisted so
      // the state still reflects "pending" for the team.
      console.error("[contact invite-portal] email failed:", e);
    }

    await logActivity({
      action: mode === "invited" ? "CONTACT_INVITED_TO_PORTAL" : "CONTACT_PORTAL_INVITE_RESENT",
      description:
        mode === "invited"
          ? `Invited ${fullName} (${email}) to the ${contact.client.name} portal`
          : `Resent portal invite to ${fullName} (${email})`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(
      {
        clientUserId: clientUser.id,
        mode,
        email,
        name: fullName,
        clientId: contact.client.id,
      },
      { status: mode === "invited" ? 201 : 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
