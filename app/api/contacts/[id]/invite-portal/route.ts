import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendClientSetPasswordEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

// Invite a Contact to the client portal: spin up a ClientUser bound
// to the same Client, mint a set-password token, fire the email.
//
// Idempotency rule: if a ClientUser already exists for this email
// (anywhere in the system — ClientUser.email is globally unique), we
// refuse rather than overwrite. The recruiter sees a useful error
// instead of silently re-using a portal account at another Client.
//
// This mirrors what quick-invite does on Job /new but starts from a
// Contact row that already exists in the CRM, so we don't have to
// re-derive the client or the name.

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

    // If a portal account already exists at this Client → noop. At a
    // different Client → block (ClientUser.email is globally unique).
    const existing = await prisma.clientUser.findUnique({
      where: { email },
      select: { id: true, clientId: true, isActive: true },
    });
    if (existing) {
      if (existing.clientId === contact.client.id) {
        return NextResponse.json(
          { error: "This person already has a portal account.", alreadyActive: true },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error:
            "This email is already used as a portal account at another client. Use a different email or update the contact.",
        },
        { status: 409 }
      );
    }

    const fullName = `${contact.firstName} ${contact.lastName}`.trim() || email;

    const clientUser = await prisma.clientUser.create({
      data: {
        email,
        name: fullName,
        title: contact.title,
        clientId: contact.client.id,
        role: "USER",
      },
    });

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
        clientName: clientUser.name,
      });
    } catch (e) {
      // Non-fatal — the recruiter can re-send from the client detail
      // page if the SMTP layer is down. We still want the ClientUser
      // row to exist so the recruiter can confirm the action took.
      console.error("[contact invite-portal] email failed:", e);
    }

    await logActivity({
      action: "CONTACT_INVITED_TO_PORTAL",
      description: `Invited ${fullName} (${email}) to the ${contact.client.name} portal`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(
      { id: clientUser.id, email, name: clientUser.name, clientId: contact.client.id },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
