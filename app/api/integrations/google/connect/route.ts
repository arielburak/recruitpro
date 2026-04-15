import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { getGoogleCalendarAuthUrl } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/integrations/google/callback`;

    // Encode userId in state for the callback
    const state = Buffer.from(
      JSON.stringify({ userId: ctx.userId })
    ).toString("base64url");

    const authUrl = getGoogleCalendarAuthUrl(redirectUri, state);
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
