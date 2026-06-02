import { NextResponse } from "next/server";
import { headers } from "next/headers";

// Returns the requester's 2-letter ISO country code as detected by the
// hosting platform (Vercel's edge sets `x-vercel-ip-country`). Used by
// PhoneInput to pre-fill the dial-code dropdown for new candidates so
// a recruiter in Argentina doesn't have to manually switch from +1
// every time. Browser-locale detection stays as the client-side
// fallback when this returns null (local dev, non-Vercel hosting).
export async function GET() {
  const h = await headers();
  const country =
    h.get("x-vercel-ip-country") ||
    h.get("cf-ipcountry") ||
    h.get("x-country") ||
    null;
  return NextResponse.json({
    country: country ? country.toUpperCase() : null,
  });
}
