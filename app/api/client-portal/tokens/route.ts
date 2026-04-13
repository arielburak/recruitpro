import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { sendClientPortalShareEmail, sendClientSetPasswordEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const { clientId, jobId, inviteEmail, inviteName } = body;

    if (!inviteEmail || typeof inviteEmail !== "string") {
      return NextResponse.json({ error: "Email address is required" }, { status: 400 });
    }

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

    // Find or create ClientUser for this email under THIS client only
    let clientUser = await prisma.clientUser.findFirst({
      where: { email: inviteEmail, clientId: client.id },
    });

    if (!clientUser) {
      // Check if this email already exists under another client (to reuse password)
      const existingElsewhere = await prisma.clientUser.findFirst({
        where: { email: inviteEmail, passwordHash: { not: null } },
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

    if (hasPassword) {
      // Existing user with password — send share notification with login link
      await sendClientPortalShareEmail({
        to: inviteEmail,
        portalUrl,
        recruiterName: ctx.userName,
        firmName: org?.name || "Your recruiting firm",
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

    return NextResponse.json({
      success: true,
      emailsSent: 1,
    }, { status: 201 });
  } catch (error: any) {
    console.error("[invite] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
