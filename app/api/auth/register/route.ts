import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { slugify } from "@/lib/utils";
import { TRIAL_DAYS } from "@/lib/constants";
import { processPendingInvites } from "@/lib/process-pending-invites";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    // Check if email exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    let slug = slugify(data.orgName);

    // Ensure unique slug
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrg) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Create org + admin user + trial subscription in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.orgName,
          slug,
        },
      });

      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          title: data.title || null,
          passwordHash,
          role: "ADMIN",
          organizationId: org.id,
        },
      });

      // Create trial subscription (Stripe customer created on first billing action)
      await tx.subscription.create({
        data: {
          organizationId: org.id,
          stripeCustomerId: `pending_${org.id}`,
          status: "TRIALING",
          trialEndsAt: new Date(
            Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
          ),
          seats: 1,
        },
      });

      return { org, user };
    });

    // Process any pending firm invites for this email
    await processPendingInvites(data.email, result.org.id).catch(() => {});

    return NextResponse.json(
      { message: "Organization created", orgId: result.org.id },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.name === "ZodError") {
      const issues = error.issues || error.errors || [];
      return NextResponse.json(
        { error: issues[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: error.message || "Registration failed" },
      { status: 500 }
    );
  }
}
