import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Verify the client user belongs to a client in this org
    const clientUser = await prisma.clientUser.findFirst({
      where: {
        id,
        client: { organizationId: ctx.organizationId },
      },
    });

    if (!clientUser) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete related records first, then the user
    await prisma.$transaction(async (tx) => {
      // Delete comments by this client user
      await tx.comment.deleteMany({ where: { clientUserId: id } });
      // Delete ratings by this client user
      await tx.candidateRating.deleteMany({ where: { clientUserId: id } });
      // Finally delete the client user
      await tx.clientUser.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
