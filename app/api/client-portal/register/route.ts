import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { companyName, name, email, password, industry, website } = await request.json();

    if (!companyName || !name || !email || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Check if email already exists
    const existingUser = await prisma.clientUser.findFirst({
      where: { email },
    });
    if (existingUser) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create client company + user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check if a client company with this name already exists (without an org - self-service)
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

      const clientUser = await tx.clientUser.create({
        data: {
          email,
          name,
          passwordHash,
          clientId: client.id,
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
