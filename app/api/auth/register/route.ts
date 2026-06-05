import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { slugify } from "@/lib/utils";
import { TRIAL_DAYS } from "@/lib/constants";
import { processPendingInvites } from "@/lib/process-pending-invites";
import { sendWelcomeEmail, sendEmailVerificationEmail } from "@/lib/email";

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
          industry: data.industry,
          companySize: data.companySize,
        },
      });

      // Email verification: generate a 32-byte hex token + 24h expiry
      // up front so the verification email can fire as part of signup.
      const verificationToken = randomBytes(32).toString("hex");
      const verificationExpiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      );

      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          title: data.title || null,
          passwordHash,
          role: "ADMIN",
          organizationId: org.id,
          emailVerificationToken: verificationToken,
          emailVerificationExpiresAt: verificationExpiresAt,
        },
      });

      // Create trial subscription (Stripe customer created on first billing action)
      const trialEndsAt = new Date(
        Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
      );
      await tx.subscription.create({
        data: {
          organizationId: org.id,
          stripeCustomerId: `pending_${org.id}`,
          status: "TRIALING",
          trialEndsAt,
          seats: 1,
        },
      });

      return { org, user, trialEndsAt, verificationToken };
    });

    // Process any pending firm invites for this email
    await processPendingInvites(data.email, result.org.id, result.user.id).catch(() => {});

    // Fire-and-forget welcome + verification emails. A delivery
    // failure (bad address, transient Resend outage) shouldn't block
    // account creation — the user can request a resend from the
    // dashboard banner once they're logged in.
    // NEXTAUTH_URL primero (canonical, seteado en deploy). El header
    // `origin` viene del browser que firma la request — puede ser
    // localhost, una preview de Vercel, un mirror. Ese host termina
    // en el link del mail y cuando el recipiente clickea cae a nada.
    // Origin queda como ultimo fallback para dev local sin env var.
    const origin = process.env.NEXTAUTH_URL || request.headers.get("origin") || "";
    sendWelcomeEmail({
      to: data.email,
      recipientName: data.name,
      organizationName: data.orgName,
      dashboardUrl: `${origin}/dashboard`,
      trialEndsAt: result.trialEndsAt,
    }).catch((err) => {
      console.error("[register] welcome email failed:", err);
    });

    sendEmailVerificationEmail({
      to: data.email,
      recipientName: data.name,
      verifyUrl: `${origin}/verify-email?token=${result.verificationToken}`,
    }).catch((err) => {
      console.error("[register] verification email failed:", err);
    });

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
