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

    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const portalUrl = `${baseUrl}/client-portal/login`;

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

    // Find or create ClientUser for this email under THIS client only.
    // The mode:"insensitive" guard is belt-and-suspenders — Postgres still
    // stores rows verbatim, so future inserts go through the normalized
    // `inviteEmail` we computed above.
    let clientUser = await prisma.clientUser.findFirst({
      where: { email: { equals: inviteEmail, mode: "insensitive" }, clientId: client.id },
    });

    if (!clientUser) {
      // Check if this email already exists under another client (to reuse password)
      const existingElsewhere = await prisma.clientUser.findFirst({
        where: {
          email: { equals: inviteEmail, mode: "insensitive" },
          passwordHash: { not: null },
        },
        select: { passwordHash: true },
      });

      clientUser = await prisma.clientUser.create({
        data: {
          email: inviteEmail,
          name: inviteName || inviteEmail.split("@")[0],
          clientId: client.id,
          // Copy password from existing account so they can log in immediately
          passwordHash: existingElsewhere?.passwordHash || undefined,
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

      const setPasswordUrl = `${baseUrl}/client-portal/set-password?token=${setPasswordToken}&email=${encodeURIComponent(inviteEmail)}`;

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
          link: "/client-portal/dashboard",
        },
      });
    } catch (e) {
      console.error("[invite] notification create failed:", e);
    }

    // Cross-Client breadcrumb: if this email already has an ACTIVE
    // ClientUser at any OTHER Client (same org or otherwise), drop a
    // heads-up notification there too — so when they log into their
    // existing portal, they still see "you got something new at Acme,
    // log in there to review". Until we ship a Client switcher, this
    // is the cheapest way to surface the cross-Client share.
    try {
      const others = await prisma.clientUser.findMany({
        where: {
          email: { equals: inviteEmail, mode: "insensitive" },
          isActive: true,
          NOT: { id: clientUser.id },
        },
        select: { id: true, clientId: true },
      });
      if (others.length > 0) {
        await prisma.clientNotification.createMany({
          data: others.map((cu) => ({
            clientId: cu.clientId,
            clientUserId: cu.id,
            type: "candidate_shared",
            title: `${firmName} shared a new search at ${client.name}`,
            body: jobTitle
              ? `Search: ${jobTitle}. Sign in as ${recipientName} at ${client.name} to review.`
              : `Sign in as ${recipientName} at ${client.name} to review.`,
            link: "/client-portal/dashboard",
          })),
        });
      }
    } catch (e) {
      console.error("[invite] cross-client notification failed:", e);
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
