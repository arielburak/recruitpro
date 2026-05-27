import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { sendClientPortalShareEmail, sendClientSetPasswordEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const { clientId, jobId, inviteEmail: rawInviteEmail, inviteName } = body;

    if (!rawInviteEmail || typeof rawInviteEmail !== "string") {
      return NextResponse.json({ error: "Email address is required" }, { status: 400 });
    }

    // Normalize email aggressively. The old (case-sensitive, untrimmed)
    // lookup was silently missing existing ClientUsers when the agency
    // re-typed the same address with different casing, which fell through
    // to the "create new account + send set-password" branch — confusing
    // the hiring contact who already had a portal login.
    const inviteEmail = rawInviteEmail.trim().toLowerCase();

    // Verify the agency is engaged with this client. The old
    // `Client.organizationId === orgId` filter only matched the agency
    // that originally created the row, so an agency that engaged with
    // a pre-existing shared client (post-PR #139) got a silent 404
    // here — the invite never reached the email-send. Engagement is
    // the source of truth for "this firm can act on this Client."
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        engagedOrganizations: { some: { organizationId: ctx.organizationId } },
      },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json(
        {
          error:
            "This client isn't in your firm's engagements. If you're sure it's the right company, open it from /clients first to re-engage.",
        },
        { status: 404 }
      );
    }

    // One email → one Client (DB-enforced via `email @unique` on
    // ClientUser). If the email already exists ANYWHERE in the system,
    // it has to be at THIS Client — otherwise the recruiter is trying
    // to attach a contact who belongs to another company. Reject with
    // a clear message so they can use the right address.
    const existing = await prisma.clientUser.findUnique({
      where: { email: inviteEmail },
      select: { id: true, clientId: true, client: { select: { name: true } } },
    });
    if (existing && existing.clientId !== client.id) {
      return NextResponse.json(
        {
          error: `This email is already in use by another client (${existing.client.name}). Use a different work or personal address for ${client.name}.`,
        },
        { status: 409 }
      );
    }

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    // Deep-link target the email CTA points to. When sharing a specific
    // job we want the recipient to land on that job, not the dashboard.
    // /go is kept as the indirection target for backwards-compat with
    // already-sent emails; it just redirects to the destination now.
    const deepLinkPath = jobId
      ? `/client-portal/go?jobId=${jobId}`
      : "/client-portal/dashboard";
    const portalUrl = `${baseUrl}/client-portal/login?callbackUrl=${encodeURIComponent(deepLinkPath)}`;

    // Get job title if sharing a specific job
    let jobTitle: string | undefined;
    let candidateCount: number | undefined;
    if (jobId) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          title: true,
          _count: {
            select: {
              submissions: { where: { isSharedWithClient: true } },
            },
          },
        },
      });
      jobTitle = job?.title;
      candidateCount = job?._count.submissions;
    }

    // Find-or-create ClientUser for this email at THIS Client. By here
    // we know the email is either free, or already attached to this
    // same Client (the cross-Client case was rejected above).
    let clientUser = await prisma.clientUser.findUnique({
      where: { email: inviteEmail },
    });

    if (!clientUser) {
      clientUser = await prisma.clientUser.create({
        data: {
          email: inviteEmail,
          name: inviteName || inviteEmail.split("@")[0],
          clientId: client.id,
        },
      });
    }

    const hasPassword = !!clientUser.passwordHash;
    const recipientName = clientUser.name;

    // Get org name for email
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });
    const firmName = org?.name || "Your recruiting firm";

    if (hasPassword) {
      // Existing user with password — send share notification with login link
      await sendClientPortalShareEmail({
        to: inviteEmail,
        portalUrl,
        recruiterName: ctx.userName,
        firmName,
        jobTitle,
        clientName: recipientName,
        candidateCount,
      });
    } else {
      // New user or user without password — send set-password invite
      const setPasswordToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await prisma.clientPortalToken.create({
        data: {
          token: setPasswordToken,
          clientId: client.id,
          expiresAt,
          isActive: true,
        },
      });

      // Forward the same deep-link target so a fresh user who sets a
      // password from the email lands on the shared Job, not dashboard.
      const setPasswordUrl =
        `${baseUrl}/client-portal/set-password?token=${setPasswordToken}` +
        `&email=${encodeURIComponent(inviteEmail)}` +
        (jobId ? `&callbackUrl=${encodeURIComponent(deepLinkPath)}` : "");

      await sendClientSetPasswordEmail({
        to: inviteEmail,
        setPasswordUrl,
        clientName: recipientName,
      });
    }

    // In-app notification for the invited ClientUser. Email is best-effort
    // (filters, missed in inbox, etc.); the bell on the portal is the
    // dependable surface. Title varies based on whether we have a specific
    // job context — generic "you got portal access" otherwise.
    try {
      const notifTitle = jobTitle
        ? `${firmName} shared ${jobTitle} with you`
        : `${firmName} invited you to the client portal`;
      const notifBody = jobTitle && candidateCount
        ? `${candidateCount} candidate${candidateCount === 1 ? "" : "s"} shared. Open the portal to review.`
        : null;
      await prisma.clientNotification.create({
        data: {
          clientId: client.id,
          clientUserId: clientUser.id,
          type: "candidate_shared",
          title: notifTitle,
          body: notifBody,
          link: jobId ? `/client-portal/jobs/${jobId}` : "/client-portal/dashboard",
        },
      });
    } catch (e) {
      console.error("[invite] notification create failed:", e);
    }

    return NextResponse.json({
      success: true,
      emailsSent: 1,
    }, { status: 201 });
  } catch (error: any) {
    console.error("[invite] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
