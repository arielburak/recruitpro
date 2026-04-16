import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();

    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can modify team members" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const member = await prisma.clientUser.findFirst({
      where: { id, clientId: ctx.clientId },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Self-protection checks
    if (id === ctx.clientUserId && body.isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    }
    if (id === ctx.clientUserId && body.role === "USER") {
      return NextResponse.json({ error: "You cannot demote yourself" }, { status: 400 });
    }

    // If demoting another admin, ensure there will still be at least one admin left
    if (body.role === "USER" && member.role === "ADMIN") {
      const adminCount = await prisma.clientUser.count({
        where: { clientId: ctx.clientId, role: "ADMIN", isActive: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "There must be at least one admin" }, { status: 400 });
      }
    }

    const updateData: any = {};
    if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;
    if (body.role === "ADMIN" || body.role === "USER") updateData.role = body.role;

    const updated = await prisma.clientUser.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, isActive: true },
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
    const ctx = await getClientContext();

    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can remove team members" }, { status: 403 });
    }

    const { id } = await params;

    const member = await prisma.clientUser.findFirst({
      where: { id, clientId: ctx.clientId },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (id === ctx.clientUserId) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }

    // Don't allow removing the last admin
    if (member.role === "ADMIN") {
      const adminCount = await prisma.clientUser.count({
        where: { clientId: ctx.clientId, role: "ADMIN", isActive: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 });
      }
    }

    await prisma.clientUser.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
