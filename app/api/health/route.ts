import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET() {
  try {
    // Test DB connection with a lightweight query
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[health] DB connection failed:", error);
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        error: safeErrorMessage(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
