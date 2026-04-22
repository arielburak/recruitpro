import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// GET - search for recruiting firms on the platform (firms with an active or
// not-yet-expired trial subscription). Single query — substring match on name,
// case-insensitive, with the trial-expiry filter pushed into Prisma so the
// result is consistent with what the user typed.
export async function GET(request: Request) {
  try {
    await getClientContext();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json([]);

    const now = new Date();
    const firms = await prisma.organization.findMany({
      where: {
        name: { contains: q, mode: "insensitive" },
        subscription: {
          OR: [
            { status: "ACTIVE" },
            {
              status: "TRIALING",
              OR: [{ trialEndsAt: null }, { trialEndsAt: { gte: now } }],
            },
          ],
        },
      },
      select: { id: true, name: true, logo: true, _count: { select: { users: true } } },
      orderBy: { name: "asc" },
      take: 20,
    });

    return NextResponse.json(firms);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

// POST - invite a specific recruiter (by email) to a job.
//
// Invites are PERSON-level, not org-level: only the invited user (and their
// firm's admins, for oversight) will see the engagement. Two paths:
//
//   a) Email belongs to a registered User → create a FirmEngagement with
//      invitedEmail + invitedUserId set. Notification goes to THAT user
//      (not the whole firm's admins).
//   b) Email is new to the platform → save a PendingFirmInvite and email the
//      person a signup link. The engagement materialises on first login via
//      processPendingInvites.
export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    const { clientJobId, email, message } = await request.json();

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!clientJobId) {
      return NextResponse.json({ error: "Job is required" }, { status: 400 });
    }
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Recruiter email is required" }, { status: 400 });
    }

    // Verify the job belongs to this client
    const job = await prisma.clientJob.findFirst({
      where: { id: clientJobId, clientId: ctx.clientId },
      include: { client: { select: { name: true } } },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Was this exact email already invited to this exact job?
    const [existingEngagement, existingPending] = await Promise.all([
      prisma.firmEngagement.findUnique({
        where: { clientJobId_invitedEmail: { clientJobId, invitedEmail: normalizedEmail } },
      }),
      prisma.pendingFirmInvite.findUnique({
        where: { email_clientJobId: { email: normalizedEmail, clientJobId } },
      }),
    ]);
    if (existingEngagement) {
      return NextResponse.json(
        { error: "That recruiter has already been invited to this job" },
        { status: 400 }
      );
    }
    if (existingPending) {
      return NextResponse.json(
        { error: "A pending invitation is already out to that email" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });

    // b) Not on the platform yet → pending invite + email
    if (!user) {
      await prisma.pendingFirmInvite.create({
        data: {
          email: normalizedEmail,
          clientJobId,
          clientId: ctx.clientId,
          message: message || null,
        },
      });

      try {
        const baseUrl =
          process.env.NEXTAUTH_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

        await getResend().emails.send({
          from: `Recruiting ATS <${process.env.EMAIL_FROM || "noreply@recruitingats.com"}>`,
          to: normalizedEmail,
          subject: `${job.client.name} wants to work with you on Recruiting ATS`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
              <h2>${job.client.name} has a new search</h2>
              <p><strong>${job.title}</strong></p>
              <p>${message || "They'd like you to work on this role."}</p>
              <p>Join Recruiting ATS to manage this engagement:</p>
              <a href="${baseUrl}/register?invite=${clientJobId}" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
                Join Recruiting ATS
              </a>
              <p style="margin-top: 16px; font-size: 13px; color: #6b7280;">
                Already have an account? <a href="${baseUrl}/login" style="color: #4f46e5;">Sign in here</a>
              </p>
            </div>
          `,
        });
      } catch {}

      return NextResponse.json({ sent: true, pending: true });
    }

    // a) Registered user → person-level engagement
    const engagement = await prisma.firmEngagement.create({
      data: {
        clientJobId,
        organizationId: user.organizationId,
        invitedEmail: normalizedEmail,
        invitedUserId: user.id,
        message: message || null,
      },
    });

    // Notify only the invited person, not their whole firm. Firm admins
    // still see the engagement via the visibility rule in /api/engagements
    // so they retain oversight — the notification is just a "you've been
    // tapped for a search" nudge to the right person.
    try {
      await prisma.userNotification.create({
        data: {
          userId: user.id,
          type: "engagement_invited",
          title: `${job.client.name} invited you to work on ${job.title}`,
          body: message || null,
          link: "/engagements",
        },
      });
    } catch {}

    return NextResponse.json(engagement, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
