import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { processPendingInvites } from "@/lib/process-pending-invites";

export async function GET() {
  try {
    const ctx = await getOrgContext();

    // Process any pending email invites for the current user
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (user) {
      await processPendingInvites(user.email, ctx.organizationId).catch(() => {});
    }

    const engagements = await prisma.firmEngagement.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        clientJob: {
          include: {
            client: { select: { name: true, industry: true } },
            postedBy: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { invitedAt: "desc" },
    });

    return NextResponse.json(engagements);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
