import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { roleForNewClientUser } from "@/lib/client-portal-roles";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id: clientId } = await params;
    const body = await request.json();

    // Verify the agency is engaged with this client (shared-Client
    // model — see lib/client-access).
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        engagedOrganizations: { some: { organizationId: ctx.organizationId } },
      },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const passwordHash = body.password
      ? await bcrypt.hash(body.password, 12)
      : null;

    // First-user-as-Admin rule (see lib/client-portal-roles).
    const role = await roleForNewClientUser(prisma, clientId, "USER");
    const clientUser = await prisma.clientUser.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        clientId,
        role,
      },
    });

    return NextResponse.json(
      { id: clientUser.id, email: clientUser.email },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
