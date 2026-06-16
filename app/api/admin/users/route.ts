import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function GET() {
  try {
    // Read is open to any authenticated org member — the My Team tab is
    // visible to every user so they can see who's on the team. Mutations
    // (POST/PATCH/DELETE below) remain admin-only.
    const ctx = await getOrgContext();

    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true, email: true, name: true, title: true, role: true,
        isActive: true, createdAt: true,
        _count: { select: { candidates: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, password, role } = body;

    // Check if email exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "USER",
        organizationId: ctx.organizationId,
      },
    });

    // Update subscription seat count
    await prisma.subscription.update({
      where: { organizationId: ctx.organizationId },
      data: { seats: { increment: 1 } },
    });

    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - toggle user active status or update role
export async function PATCH(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { userId, isActive, role } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Prevent self-deactivation/demotion
    if (userId === ctx.userId && isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    }
    if (userId === ctx.userId && role === "USER") {
      return NextResponse.json({ error: "You cannot demote yourself" }, { status: 400 });
    }

    // Verify user belongs to same org
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If demoting an admin or deactivating an admin, ensure at least one admin remains
    if ((role === "USER" && user.role === "ADMIN") || (isActive === false && user.role === "ADMIN")) {
      const adminCount = await prisma.user.count({
        where: { organizationId: ctx.organizationId, role: "ADMIN", isActive: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "There must be at least one admin" }, { status: 400 });
      }
    }

    const normalizedRole = role === "ADMIN" ? "ADMIN" : role === "USER" ? "USER" : undefined;

    const updateData: any = {};
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (normalizedRole) updateData.role = normalizedRole;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - remove a user from the organization
export async function DELETE(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === ctx.userId) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }

    // Verify user belongs to same org
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Don't allow removing the last admin
    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { organizationId: ctx.organizationId, role: "ADMIN", isActive: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 });
      }
    }

    await prisma.user.delete({ where: { id: userId } });

    // Decrement subscription seats
    try {
      await prisma.subscription.update({
        where: { organizationId: ctx.organizationId },
        data: { seats: { decrement: 1 } },
      });
    } catch {
      // Subscription may not exist — non-fatal
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
