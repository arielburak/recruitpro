import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { generateClientPortalToken } from "@/lib/tokens";
import { prisma } from "@/lib/prisma";
import { sendClientPortalShareEmail, sendClientSetPasswordEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const { clientId, jobId, expiresInDays } = body;

    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactName: true,
        clientUsers: {
          where: { isActive: true },
          select: { id: true, email: true, name: true, passwordHash: true },
        },
      },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const token = await generateClientPortalToken(clientId, jobId, expiresInDays);
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

    // Collect all email recipients: client users + contact email
    const emailRecipients: { email: string; name: string; hasPassword: boolean }[] = [];

    // Add all active client users
    for (const cu of client.clientUsers) {
      emailRecipients.push({
        email: cu.email,
        name: cu.name,
        hasPassword: !!cu.passwordHash,
      });
    }

    // Add client contact email if not already a client user
    if (client.contactEmail && !emailRecipients.some((r) => r.email === client.contactEmail)) {
      // Auto-create a ClientUser for the contact so they can log in
      const existingUser = await prisma.clientUser.findFirst({
        where: { email: client.contactEmail, clientId: client.id },
      });

      if (!existingUser) {
        await prisma.clientUser.create({
          data: {
            email: client.contactEmail,
            name: client.contactName || client.name,
            clientId: client.id,
          },
        });
      }

      emailRecipients.push({
        email: client.contactEmail,
        name: client.contactName || client.name,
        hasPassword: !!existingUser?.passwordHash,
      });
    }

    // Send emails to all recipients
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });

    for (const recipient of emailRecipients) {
      try {
        if (recipient.hasPassword) {
          // Existing user with password — send share notification with login link
          await sendClientPortalShareEmail({
            to: recipient.email,
            portalUrl,
            recruiterName: ctx.userName,
            firmName: org?.name || "Your recruiting firm",
            jobTitle,
            clientName: recipient.name,
            candidateCount,
          });
        } else {
          // User without password — send set-password email
          // Generate a set-password token
          const setPasswordToken = crypto.randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          // Store the token (reuse ClientPortalToken with a flag)
          await prisma.clientPortalToken.create({
            data: {
              token: setPasswordToken,
              clientId: client.id,
              expiresAt,
              isActive: true,
            },
          });

          const setPasswordUrl = `${baseUrl}/client-portal/set-password?token=${setPasswordToken}&email=${encodeURIComponent(recipient.email)}`;

          await sendClientSetPasswordEmail({
            to: recipient.email,
            setPasswordUrl,
            clientName: recipient.name,
          });
        }
      } catch (emailError) {
        console.error(`[share] Failed to email ${recipient.email}:`, emailError);
        // Don't fail the whole request if one email fails
      }
    }

    return NextResponse.json({
      token: token.token,
      portalUrl: `${baseUrl}/client-portal/${token.token}`,
      emailsSent: emailRecipients.length,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
