import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// DELETE — cancel a pending email invite that was sent to someone who
// hadn't yet registered on the platform. Same contract as withdrawing a
// FirmEngagement in "PENDING" state: the recipient hasn't responded, so
// revoking is safe.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;

    const invite = await prisma.pendingFirmInvite.findUnique({
      where: { id },
      select: { clientId: true },
    });

    if (!invite || invite.clientId !== ctx.clientId) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    await prisma.pendingFirmInvite.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
