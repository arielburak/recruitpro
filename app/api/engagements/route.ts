import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getOrgContext();

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
