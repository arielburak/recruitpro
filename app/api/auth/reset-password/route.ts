import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // Rate limit por IP. Token es random 32 bytes (no brute-forceable)
    // pero defensivo igual contra DDoS al endpoint.
    const rl = await checkRateLimit("auth:reset-password", getClientIp(request));
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!record || record.usedAt || record.expiresAt < new Date() || !record.userId) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired" },
        { status: 400 }
      );
    }

    // Cost 12, igual que /api/auth/register. Estaba en 10: cualquiera
    // que reseteara su password terminaba, en silencio, con un hash
    // mas debil que el que le dio el alta.
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate any other outstanding tokens for this user
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
