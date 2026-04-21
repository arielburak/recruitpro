import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeMicrosoftCode,
  getMicrosoftEmail,
} from "@/lib/microsoft-calendar";

// Redirect destination uses the unified /settings/integrations tab so
// the user sees the success/error banner on the same page they started
// the connect flow from.
const SETTINGS_URL = "/settings/integrations";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const stateParam = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL(`${SETTINGS_URL}?microsoft=denied`, request.nextUrl.origin)
      );
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        new URL(`${SETTINGS_URL}?microsoft=error`, request.nextUrl.origin)
      );
    }

    let userId: string;
    try {
      const state = JSON.parse(
        Buffer.from(stateParam, "base64url").toString()
      );
      userId = state.userId;
    } catch {
      return NextResponse.redirect(
        new URL(`${SETTINGS_URL}?microsoft=error`, request.nextUrl.origin)
      );
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/integrations/microsoft/callback`;

    const tokens = await exchangeMicrosoftCode(code, redirectUri);
    const email = await getMicrosoftEmail(tokens.access_token);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await (prisma as any).userIntegration.upsert({
      where: {
        userId_provider: { userId, provider: "microsoft_teams" },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
        email,
      },
      create: {
        userId,
        provider: "microsoft_teams",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        email,
      },
    });

    return NextResponse.redirect(
      new URL(`${SETTINGS_URL}?microsoft=connected`, request.nextUrl.origin)
    );
  } catch (error: any) {
    console.error("[microsoft-callback] Error:", error.message, error.stack);
    return NextResponse.redirect(
      new URL(`${SETTINGS_URL}?microsoft=error`, request.nextUrl.origin)
    );
  }
}
