import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// GET — resolve a single email for the invite form.
//
// The client portal's "Invite a Recruiter" picker uses this to show live
// feedback while the user types:
//   - "Found · Nick Cuello at Alphabridge" if the email belongs to a
//     registered User whose firm has an active/trialing subscription
//   - "No account — we'll email them a signup link" otherwise
//
// We also flag if this email was already invited to the current job so
// the UI can disable Send and say so up-front instead of 400-ing on
// submit.
//
// Privacy note: this is the same resolution that POST invite-firm has
// always done silently — we're just surfacing the result before the
// action. We restrict User matches to firms with a live subscription
// (same filter as the firms search) to avoid leaking random platform
// Users.
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

    const now = new Date();

    const [user, engagement, pending] = await Promise.all([
      prisma.user.findFirst({
        where: {
          email,
          organization: {
            subscription: {
              OR: [
                { status: "ACTIVE" },
                {
                  status: "TRIALING",
                  OR: [{ trialEndsAt: null }, { trialEndsAt: { gte: now } }],
                },
              ],
            },
          },
        },
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
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
