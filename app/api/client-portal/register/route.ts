import { NextResponse } from "next/server";

// Client portal is invite-only — the UI no longer surfaces a signup
// form, so this endpoint just refuses anything that still reaches it
// (stale bookmarks, scripted POSTs). Activation happens through
// /api/client-portal/set-password (token email) or by an agency
// adding the email via the agency-side client portal management.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "The client portal is invite-only. Ask your recruiting partner to invite you.",
    },
    { status: 403 },
  );
}
