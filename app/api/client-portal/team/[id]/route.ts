import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

async function getClientId() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (user?.clientId) return { clientId: user.clientId, userId: user.id };
  if (user?.email) {
    const cu = await prisma.clientUser.findFirst({ where: { email: user.email, isActive: true } });
    if (cu) return { clientId: cu.clientId, userId: cu.id };
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getClientId();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const member = await prisma.clientUser.findFirst({
      where: { id, clientId: auth.clientId },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (id === auth.userId && body.isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    }

    const updated = await prisma.clientUser.update({
      where: { id },
      data: { isActive: body.isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getClientId();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const member = await prisma.clientUser.findFirst({
      where: { id, clientId: auth.clientId },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (id === auth.userId) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }

    await prisma.clientUser.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
