import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

// GET — resolve a single email for the invite form.
//
// The client portal's "Invite a Recruiter" picker uses this to show live
// feedback while the user types:
//   - "Found · Nick Cuello at Alphabridge" if the email belongs to a
//     registered User
//   - "No account — we'll email them a signup link" otherwise
//
// We also flag if this email was already invited to the current job so
// the UI can disable Send and say so up-front instead of 400-ing on
// submit.
//
// Resolution is aligned with POST invite-firm: a plain findUnique by
// email, no subscription filter. Earlier versions gated by sub status
// here but not in the invite POST, which caused "No account found" to
// show for recruiters whose firm had an expired trial — confusing and
// inconsistent. The subscription check lives at accept time where the
// user gets a clear message about renewing.
export async function GET(request: Request) {
  try {
    const ctx = await getClientContext();
    const url = new URL(request.url);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    const clientJobId = url.searchParams.get("clientJobId");

    // Cheap email-shape gate: no point hitting the DB for "foo".
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ email, shape: "invalid" });
    }

    const [user, engagement, pending] = await Promise.all([
      prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          organization: { select: { id: true, name: true } },
        },
      }),
      clientJobId
        ? prisma.firmEngagement.findUnique({
            where: { clientJobId_invitedEmail: { clientJobId, invitedEmail: email } },
            select: { id: true, status: true },
          })
        : Promise.resolve(null),
      clientJobId
        ? prisma.pendingFirmInvite.findUnique({
            where: { email_clientJobId: { email, clientJobId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      email,
      shape: "valid",
      onPlatform: Boolean(user),
      name: user?.name || null,
      firmName: user?.organization.name || null,
      alreadyOnThisJob: Boolean(engagement || pending),
      alreadyOnThisJobStatus: engagement
        ? engagement.status === "ACCEPTED"
          ? "accepted"
          : engagement.status === "DECLINED"
          ? "declined"
          : "pending"
        : pending
        ? "email_sent"
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
