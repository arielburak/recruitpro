import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id: clientId } = await params;
    const body = await request.json();

    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const passwordHash = body.password
      ? await bcrypt.hash(body.password, 12)
      : null;

    const clientUser = await prisma.clientUser.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        clientId,
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
