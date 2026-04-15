import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeGoogleCode, getGoogleEmail } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const stateParam = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");

    if (error) {
      // User denied access
      return NextResponse.redirect(
        new URL("/admin/settings?google=denied", request.nextUrl.origin)
      );
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        new URL("/admin/settings?google=error", request.nextUrl.origin)
      );
    }

    // Decode state
    let userId: string;
    try {
      const state = JSON.parse(
        Buffer.from(stateParam, "base64url").toString()
      );
      userId = state.userId;
    } catch {
      return NextResponse.redirect(
        new URL("/admin/settings?google=error", request.nextUrl.origin)
      );
    }

    // Exchange code for tokens
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/integrations/google/callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);

    // Get the connected Google email
    const email = await getGoogleEmail(tokens.access_token);

    // Save or update integration
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.userIntegration.upsert({
      where: {
        userId_provider: { userId, provider: "google_calendar" },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
        email,
      },
      create: {
        userId,
        provider: "google_calendar",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        email,
      },
    });

    return NextResponse.redirect(
      new URL("/admin/settings?google=connected", request.nextUrl.origin)
    );
  } catch (error: any) {
    console.error("[google-callback] Error:", error);
    return NextResponse.redirect(
      new URL("/admin/settings?google=error", request.nextUrl.origin)
    );
  }
}
