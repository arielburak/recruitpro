import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { getMicrosoftCalendarAuthUrl } from "@/lib/microsoft-calendar";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/integrations/microsoft/callback`;

    // Encode userId in state for the callback
    const state = Buffer.from(
      JSON.stringify({ userId: ctx.userId })
    ).toString("base64url");

    const authUrl = getMicrosoftCalendarAuthUrl(redirectUri, state);
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
