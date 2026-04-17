import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getOrgContext();

    const integration = await (prisma as any).userIntegration.findUnique({
      where: {
        userId_provider: { userId: ctx.userId, provider: "google_calendar" },
      },
      select: { email: true, createdAt: true },
    });

    return NextResponse.json({
      connected: !!integration,
      email: integration?.email || null,
      connectedAt: integration?.createdAt || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    const ctx = await getOrgContext();

    await (prisma as any).userIntegration.deleteMany({
      where: { userId: ctx.userId, provider: "google_calendar" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
