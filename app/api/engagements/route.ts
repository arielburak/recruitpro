import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { processPendingInvites } from "@/lib/process-pending-invites";

// List engagements visible to the current staffing user.
//
// Invites are STRICTLY person-level: admins do NOT see engagements they
// weren't invited to. The client on the other side chose to reach out to
// a specific person (e.g. an HM of a given area), and exposing that to
// the whole firm — even just to admins — defeats the purpose.
//
// The one exception is legacy rows that pre-date person-level invites
// (invitedUserId is null). We can't retroactively figure out who those
// were meant for, so we grandfather them as admin-visible instead of
// orphaning the data.
export async function GET() {
  try {
    const ctx = await getOrgContext();

    // Process any pending email invites for the current user
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (user) {
      await processPendingInvites(user.email, ctx.organizationId, ctx.userId).catch(() => {});
    }

    const personalClause: any = { invitedUserId: ctx.userId };
    const legacyAdminClause: any = { invitedUserId: null };

    const where: any = {
      organizationId: ctx.organizationId,
      OR: ctx.role === "ADMIN"
        ? [personalClause, legacyAdminClause]
        : [personalClause],
    };

    const engagements = await prisma.firmEngagement.findMany({
      where,
      include: {
        clientJob: {
          include: {
            client: { select: { name: true, industry: true } },
            postedBy: { select: { name: true, email: true } },
          },
        },
        invitedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { invitedAt: "desc" },
    });

    return NextResponse.json(engagements);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
