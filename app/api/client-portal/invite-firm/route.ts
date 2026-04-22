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

// POST - invite a firm to a job
export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    const { clientJobId, organizationId, email, message } = await request.json();

    if (!clientJobId) {
      return NextResponse.json({ error: "Job is required" }, { status: 400 });
    }

    // Verify the job belongs to this client
    const job = await prisma.clientJob.findFirst({
      where: { id: clientJobId, clientId: ctx.clientId },
      include: { client: { select: { name: true } } },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    let orgId = organizationId;

    // If no orgId but email provided, try to find the firm or send email invite
    if (!orgId && email) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { organizationId: true, organization: { select: { name: true } } },
      });

      if (user) {
        orgId = user.organizationId;
      } else {
        // Save pending invite so it can be picked up after registration/login
        await prisma.pendingFirmInvite.upsert({
          where: { email_clientJobId: { email, clientJobId } },
          update: { message: message || null },
          create: {
            email,
            clientJobId,
            clientId: ctx.clientId,
            message: message || null,
          },
        });

        // Send email invite to join the platform
        try {
          const baseUrl = process.env.NEXTAUTH_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

          await getResend().emails.send({
            from: `Recruiting ATS <${process.env.EMAIL_FROM || "noreply@recruitingats.com"}>`,
            to: email,
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

        return NextResponse.json({ sent: true, message: "Email invitation sent" });
      }
    }

    if (!orgId) {
      return NextResponse.json({ error: "Please select a firm or enter an email" }, { status: 400 });
    }

    // Check for existing engagement
    const existing = await prisma.firmEngagement.findUnique({
      where: { clientJobId_organizationId: { clientJobId, organizationId: orgId } },
    });
    if (existing) {
      return NextResponse.json({ error: "This firm has already been invited" }, { status: 400 });
    }

    const engagement = await prisma.firmEngagement.create({
      data: {
        clientJobId,
        organizationId: orgId,
        message: message || null,
      },
    });

    // Notify every admin in the invited firm so they actually find out about
    // the request without having to randomly check /engagements. We hit only
    // ADMINs to avoid spamming the entire firm — they can route it internally.
    try {
      const admins = await prisma.user.findMany({
        where: { organizationId: orgId, role: "ADMIN" },
        select: { id: true },
      });
      if (admins.length > 0) {
        await prisma.userNotification.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            type: "engagement_invited",
            title: `${job.client.name} invited you to work on ${job.title}`,
            body: message || null,
            link: "/engagements",
          })),
        });
      }
    } catch {}

    return NextResponse.json(engagement, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
