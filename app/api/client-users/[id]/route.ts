import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    // Verify the client user belongs to a Client this agency is
    // engaged with. We can't just check ownership anymore — multiple
    // agencies share Clients now.
    const clientUser = await prisma.clientUser.findFirst({
      where: {
        id,
        client: {
          engagedOrganizations: { some: { organizationId: ctx.organizationId } },
        },
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
