import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// DELETE — withdraw a firm invitation from the client portal side.
// Only PENDING engagements can be withdrawn: once a firm has accepted, they
// already have a Job in their workspace and the relationship is "live", so
// the client should talk to them directly instead of pulling the rug.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;

    const engagement = await prisma.firmEngagement.findUnique({
      where: { id },
      include: { clientJob: { select: { clientId: true } } },
    });

    if (!engagement || engagement.clientJob.clientId !== ctx.clientId) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    if (engagement.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending invitations can be withdrawn" },
        { status: 400 }
      );
    }

    await prisma.firmEngagement.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
