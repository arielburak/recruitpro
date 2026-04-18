import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { TRIAL_DAYS } from "@/lib/constants";

const onboardingSchema = z.object({
  orgName: z.string().trim().min(2, "Company name must be at least 2 characters"),
  industry: z.string().trim().max(120).optional(),
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

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: org.id },
        data: {
          name: data.orgName,
          slug,
          needsOnboarding: false,
        },
      });

      if (!org.subscription) {
        await tx.subscription.create({
          data: {
            organizationId: org.id,
            stripeCustomerId: `pending_${org.id}`,
            status: "TRIALING",
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
            seats: 1,
          },
        });
      }
    });

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
