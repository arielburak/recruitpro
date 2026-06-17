import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendClientSetPasswordEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";
import { roleForNewClientUser } from "@/lib/client-portal-roles";
import { requireVerifiedEmail } from "@/lib/require-verified-email";
import { safeErrorMessage } from "@/lib/safe-error";

// Invite a Contact to the client portal, or resend the invite if they
// were already invited but never redeemed the token. State machine:
//
//   no ClientUser yet     → create ClientUser + mint token + send mail
//   ClientUser, pending   → mint a fresh token + send mail (resend)
//   ClientUser, active    → 409 "already a portal user, nothing to do"
//   exists at OTHER Client → 409 "email already taken elsewhere"
//
// Optional `jobId` (agency-side Job.id) grants Job-level access in
// the same call: we look up the ClientJob mirror via sourceJobId /
// FirmEngagement and upsert a ClientJobMember row for the new
// ClientUser. This makes agency-side invites symmetric with the
// client-side flow ("from either side, you get access"). Without
// jobId the endpoint stays portal-level only.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

    const ctx = await getOrgContext();
    const { id } = await params;

    // Optional job-level access. Reading the body is cheap and if
    // it's empty / non-JSON we treat it as "no job context".
    let jobId: string | null = null;
    try {
      const body = await request.json();
      const raw = (body as { jobId?: unknown }).jobId;
      if (typeof raw === "string" && raw.length > 0) jobId = raw;
    } catch {
      // no body, ok — invite stays portal-only
    }

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
    // recruiter sees a short message — the full company name still
    // gets shown via the row tooltip if needed.
    if (existing && existing.clientId !== contact.client.id) {
      return NextResponse.json(
        {
          error: `Email already used at ${existing.client.name}`,
        },
        { status: 409 }
      );
    }

    // Same Client + already redeemed the invite → nothing useful to do
    // from a UI that's calling this endpoint.
    if (existing && existing.passwordHash) {
      return NextResponse.json(
        { error: "Already has portal access", alreadyActive: true },
        { status: 409 }
      );
    }

    let clientUser = existing;
    let mode: "invited" | "resent" = "invited";
    const fullName = `${contact.firstName} ${contact.lastName}`.trim() || email;

    if (!clientUser) {
      // First-user-as-Admin rule: if the client has nobody managing
      // the portal yet, this invite mints them as the team's first
      // ADMIN so they can promote / invite others later.
      const role = await roleForNewClientUser(prisma, contact.client.id, "USER");
      const created = await prisma.clientUser.create({
        data: {
          email,
          name: fullName,
          title: contact.title,
          clientId: contact.client.id,
          role,
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

    // Optional Job-level access. Resolve the ClientJob backing the
    // agency Job.id and add the (potentially just-created)
    // ClientUser as a ClientJobMember. Two lookup paths mirror
    // /api/client-portal/go:
    //   1) ClientJob.sourceJobId === jobId (mirror created by /tokens)
    //   2) FirmEngagement.jobId === jobId + ACCEPTED → clientJobId
    // We only act if the resolved ClientJob belongs to the same
    // Client as the invited contact, so a stale Job.id can't grant
    // access across clients.
    let grantedJobMembership = false;
    if (jobId && clientUser) {
      let clientJobId: string | null = null;
      const mirror = await prisma.clientJob.findFirst({
        where: { sourceJobId: jobId, clientId: contact.client.id },
        select: { id: true },
      });
      if (mirror) {
        clientJobId = mirror.id;
      } else {
        const engagement = await prisma.firmEngagement.findFirst({
          where: {
            jobId,
            status: "ACCEPTED",
            clientJob: { clientId: contact.client.id },
          },
          select: { clientJobId: true },
        });
        if (engagement) clientJobId = engagement.clientJobId;
      }
      if (clientJobId) {
        try {
          await prisma.clientJobMember.upsert({
            where: {
              clientJobId_clientUserId: {
                clientJobId,
                clientUserId: clientUser.id,
              },
            },
            update: {},
            create: { clientJobId, clientUserId: clientUser.id },
          });
          grantedJobMembership = true;
        } catch (e) {
          console.error("[contact invite-portal] grant job member failed:", e);
        }
      }
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

    // Pull the firm name so the email greeting can say "Morabits has
    // shared candidates..." instead of the generic "A recruiting firm".
    // Single indexed lookup; non-fatal on failure (we just fall back).
    let firmName: string | undefined = undefined;
    try {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      });
      firmName = org?.name || undefined;
    } catch {}

    try {
      await sendClientSetPasswordEmail({
        to: email,
        setPasswordUrl,
        clientName: fullName,
        firmName,
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
        grantedJobMembership,
      },
      { status: mode === "invited" ? 201 : 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
