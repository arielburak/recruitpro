import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ exists: false });
    }

    const clientUser = await prisma.clientUser.findFirst({
      where: { email, isActive: true },
      select: { id: true, passwordHash: true },
    });

    if (!clientUser) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      hasPassword: !!clientUser.passwordHash,
    });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
