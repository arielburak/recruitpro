import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";

export async function POST(request: Request) {
  try {
    await getOrgContext();
    const { url } = await request.json();

    if (!url || !url.includes("linkedin.com")) {
      return NextResponse.json({ error: "Please provide a valid LinkedIn URL" }, { status: 400 });
    }

    // Note: Direct LinkedIn scraping requires LinkedIn API access or a third-party service
    // For now, we extract what we can from the URL and create a placeholder
    const profileSlug = url.match(/linkedin\.com\/in\/([\w-]+)/)?.[1] || "";

    return NextResponse.json({
      linkedIn: url.startsWith("http") ? url : `https://${url}`,
      source: "LinkedIn",
      // In production, integrate with LinkedIn API, Proxycurl, or similar service
      message: "LinkedIn URL saved. For full profile import, connect your LinkedIn API key in Settings.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
