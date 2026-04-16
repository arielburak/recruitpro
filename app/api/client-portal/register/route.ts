import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { companyName, name, title, email, password, industry, website } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Check if any ClientUser exists with this email
    const existingUsers = await prisma.clientUser.findMany({
      where: { email },
    });

    if (existingUsers.length > 0) {
      // Check if any already has a password set
      const hasPasswordUser = existingUsers.find((u) => u.passwordHash);
      if (hasPasswordUser) {
        return NextResponse.json({ error: "Email already registered. Please sign in instead." }, { status: 400 });
      }

      // User(s) exist without password (invited by recruiter) — set password on ALL of them
      await prisma.clientUser.updateMany({
        where: { email, passwordHash: null },
        data: { passwordHash, name, ...(title ? { title } : {}) },
      });

      return NextResponse.json(
        { message: "Account activated", clientId: existingUsers[0].clientId },
        { status: 201 }
      );
    }

    // Brand new user — company name is required
    if (!companyName) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    // Create client company + user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let client = await tx.client.findFirst({
        where: { name: companyName, organizationId: null },
      });

      if (!client) {
        client = await tx.client.create({
          data: {
            name: companyName,
            industry: industry || null,
            website: website || null,
          },
        });
      }

      // Check if this is the first user of this client — they become ADMIN
      const existingUsersForClient = await tx.clientUser.count({
        where: { clientId: client.id },
      });
      const isFirstUser = existingUsersForClient === 0;

      const clientUser = await tx.clientUser.create({
        data: {
          email,
          name,
          title: title || null,
          passwordHash,
          clientId: client.id,
          role: isFirstUser ? "ADMIN" : "USER",
        },
      });

      return { client, clientUser };
    });

    return NextResponse.json(
      { message: "Account created", clientId: result.client.id },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
