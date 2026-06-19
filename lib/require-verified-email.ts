import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";

// Server-side gate for actions that can send mail (or otherwise
// reach a third party) when the signed-in user hasn't verified
// their address yet. Endpoints that can affect outsiders — team
// invites, client portal shares, candidate-feedback mail,
// stage-transition notifications — wrap their handler with this.
//
// Soft-block lives here, not in login (see auth-options.ts). The
// verified flag is stamped on the JWT, so this check is one
// session read, no DB hit.
//
// Usage:
//
//   export async function POST(req: Request) {
//     const guard = await requireVerifiedEmail();
//     if (guard) return guard;
//     // ...
//   }
export async function requireVerifiedEmail() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(session.user as any).emailVerified) {
    return NextResponse.json(
      {
        error: "EMAIL_NOT_VERIFIED",
        message:
          "Verify your email address before taking this action. Check your inbox or request a new link from the banner on your dashboard.",
      },
      { status: 403 },
    );
  }
  return null;
}
