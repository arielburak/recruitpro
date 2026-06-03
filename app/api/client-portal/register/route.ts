import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STAGES } from "@/lib/constants";
import { sendEmailVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { companyName, name, title, email: rawEmail, password, industry, website } = await request.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }

    // Title (role at the hiring company) is required at signup —
    // recruiters need it to route comments / mentions correctly,
    // and asking for it later via a banner has been ignored. The
    // set-password (invite) flow enforces the same rule.
    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    if (!trimmedTitle) {
      return NextResponse.json({ error: "Your role is required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const existing = await prisma.clientUser.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.passwordHash) {
        return NextResponse.json({ error: "Email already registered. Please sign in instead." }, { status: 400 });
      }

      // Invited row without a password yet — activate it. The mail token
      // they used to reach the set-password screen is proof of ownership,
      // so we treat that path as implicit verification. This /register
      // endpoint is a fallback for users who manually visit the register
      // form with an invited email; we still send a verification email
      // and gate login until they click.
      const verificationToken = randomBytes(32).toString("hex");
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.clientUser.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name,
          title: trimmedTitle,
          emailVerificationToken: verificationToken,
          emailVerificationExpiresAt: verificationExpiresAt,
        },
      });

      const origin = request.headers.get("origin") || process.env.NEXTAUTH_URL || "";
      sendEmailVerificationEmail({
        to: email,
        recipientName: name,
        verifyUrl: `${origin}/client-portal/verify-email?token=${verificationToken}`,
      }).catch((err) => console.error("[client-register] verify mail failed:", err));

      return NextResponse.json(
        { message: "Account activated", clientId: existing.clientId, needsVerification: true },
        { status: 201 }
      );
    }

    if (!companyName) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const verificationToken = randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      let client = await tx.client.findFirst({
        where: { name: companyName, organizationId: null },
      });

      if (!client) {
        const created = await tx.client.create({
          data: {
            name: companyName,
            industry: industry || null,
            website: website || null,
          },
        });
        client = created;
        await tx.clientPipelineStage.createMany({
          data: DEFAULT_STAGES.map((s, i) => ({
            name: s.name,
            order: i,
            color: s.color,
            isTerminal: s.isTerminal,
            kind: s.kind,
            clientId: created.id,
          })),
        });
      }

      const existingUsersForClient = await tx.clientUser.count({
        where: { clientId: client.id },
      });
      const isFirstUser = existingUsersForClient === 0;

      const clientUser = await tx.clientUser.create({
        data: {
          email,
          name,
          title: trimmedTitle,
          passwordHash,
          clientId: client.id,
          role: isFirstUser ? "ADMIN" : "USER",
          emailVerificationToken: verificationToken,
          emailVerificationExpiresAt: verificationExpiresAt,
        },
      });

      return { client, clientUser };
    });

    // Fire-and-forget; a transient mail failure shouldn't fail the
    // account creation. The user can request a resend from the
    // verify-email landing page.
    const origin = request.headers.get("origin") || process.env.NEXTAUTH_URL || "";
    sendEmailVerificationEmail({
      to: email,
      recipientName: name,
      verifyUrl: `${origin}/client-portal/verify-email?token=${verificationToken}`,
    }).catch((err) => console.error("[client-register] verify mail failed:", err));

    return NextResponse.json(
      { message: "Account created", clientId: result.client.id, needsVerification: true },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
