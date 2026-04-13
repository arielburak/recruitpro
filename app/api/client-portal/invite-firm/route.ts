import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// GET - search for recruiting firms on the platform
export async function GET(request: Request) {
  try {
    await getClientContext();
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";

    const firms = await prisma.organization.findMany({
      where: {
        name: { contains: q, mode: "insensitive" },
      },
      select: { id: true, name: true, logo: true, _count: { select: { users: true } } },
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
        // Send email invite to join the platform
        try {
          const baseUrl = process.env.NEXTAUTH_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

          await getResend().emails.send({
            from: process.env.EMAIL_FROM || "noreply@alphabridgepartners.net",
            to: email,
            subject: `${job.client.name} wants to work with you on RecruitPro`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
                <h2>${job.client.name} has a new search</h2>
                <p><strong>${job.title}</strong></p>
                <p>${message || "They'd like you to work on this role."}</p>
                <p>Join RecruitPro to manage this engagement:</p>
                <a href="${baseUrl}/register" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
                  Join RecruitPro
                </a>
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

    // TODO: Send in-app notification to the firm

    return NextResponse.json(engagement, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
