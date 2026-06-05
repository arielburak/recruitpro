import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS, TRIAL_DAYS } from "@/lib/constants";
import { sendWelcomeEmail } from "@/lib/email";

const onboardingSchema = z.object({
  orgName: z.string().trim().min(2, "Company name must be at least 2 characters"),
  industry: z
    .string()
    .refine((v) => INDUSTRY_OPTIONS.includes(v), "Please pick your industry"),
  companySize: z
    .string()
    .refine((v) => COMPANY_SIZE_OPTIONS.includes(v), "Please pick your team size"),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id || user.isClientUser || !user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = onboardingSchema.parse(body);

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      include: { subscription: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let slug = slugify(data.orgName);
    if (!slug) slug = `firm-${Date.now().toString(36)}`;
    if (slug !== org.slug) {
      const existing = await prisma.organization.findUnique({ where: { slug } });
      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }
    }

    // First-time-onboarding moment for OAuth signups: email/password
    // users already got their welcome email from /api/auth/register
    // (org name was captured at that step). OAuth users land in
    // /onboarding with a placeholder org and only "complete" signup
    // here — so this is the right place to fire their welcome.
    const isFirstOnboarding = org.needsOnboarding;
    const trialEndsAt =
      org.subscription?.trialEndsAt ||
      new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: org.id },
        data: {
          name: data.orgName,
          slug,
          industry: data.industry,
          companySize: data.companySize,
          needsOnboarding: false,
        },
      });

      if (!org.subscription) {
        await tx.subscription.create({
          data: {
            organizationId: org.id,
            stripeCustomerId: `pending_${org.id}`,
            status: "TRIALING",
            trialEndsAt,
            seats: 1,
          },
        });
      }
    });

    if (isFirstOnboarding) {
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, name: true },
      });
      if (fullUser) {
        // NEXTAUTH_URL primero (canonical). Ver comentario en
        // /api/auth/register.
        const origin = process.env.NEXTAUTH_URL || request.headers.get("origin") || "";
        sendWelcomeEmail({
          to: fullUser.email,
          recipientName: fullUser.name,
          organizationName: data.orgName,
          dashboardUrl: `${origin}/dashboard`,
          trialEndsAt,
        }).catch((err) => {
          console.error("[onboarding] welcome email failed:", err);
        });
      }
    }

    return NextResponse.json({
      organizationId: org.id,
      organizationName: data.orgName,
      needsOnboarding: false,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      const issues = error.issues || error.errors || [];
      return NextResponse.json(
        { error: issues[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: error.message || "Onboarding failed" },
      { status: 500 }
    );
  }
}
