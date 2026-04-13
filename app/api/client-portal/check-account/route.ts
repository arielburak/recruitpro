import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ exists: false });
    }

    const clientUsers = await prisma.clientUser.findMany({
      where: { email, isActive: true },
      select: { id: true, passwordHash: true },
    });

    if (clientUsers.length === 0) {
      return NextResponse.json({ exists: false });
    }

    // User "has password" if ANY of their records has a password
    const hasPassword = clientUsers.some((u) => !!u.passwordHash);

    return NextResponse.json({
      exists: true,
      hasPassword,
    });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
