import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { processPendingInvites } from "@/lib/process-pending-invites";

// List engagements visible to the current staffing user.
//
// Visibility rules:
//   - Firm ADMINs see every engagement for the firm (oversight + billing).
//   - Non-ADMINs see only engagements where they are the invited user.
//   - Legacy engagements that pre-date person-level invites (no
//     invitedUserId on the row) stay admin-only so we don't accidentally
//     leak them into everyone's inbox.
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

    const where: any = { organizationId: ctx.organizationId };
    if (ctx.role !== "ADMIN") {
      where.invitedUserId = ctx.userId;
    }

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
