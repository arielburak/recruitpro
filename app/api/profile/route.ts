import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

// GET my profile (works for both staffing and client users)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user.isClientUser) {
      const cu = await prisma.clientUser.findUnique({
        where: { id: user.id },
        select: {
          id: true, name: true, email: true, title: true, isActive: true, createdAt: true,
          client: { select: { name: true, industry: true } },
        },
      });
      if (!cu) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({
        type: "client" as const,
        id: cu.id,
        name: cu.name,
        email: cu.email,
        title: cu.title,
        companyName: cu.client.name,
        industry: cu.client.industry,
        createdAt: cu.createdAt,
      });
    }

    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, name: true, email: true, role: true, avatar: true, isActive: true, createdAt: true,
        organization: { select: { name: true } },
      },
    });
    if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      type: "staffing" as const,
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatar: u.avatar,
      organizationName: u.organization.name,
      createdAt: u.createdAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH update my own profile (name, title for client, avatar for staffing)
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : undefined;

    if (name !== undefined && name.length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    if (user.isClientUser) {
      const title = typeof body.title === "string" ? body.title.trim() : undefined;
      const updated = await prisma.clientUser.update({
        where: { id: user.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(title !== undefined ? { title: title || null } : {}),
        },
        select: { id: true, name: true, email: true, title: true },
      });
      return NextResponse.json(updated);
    }

    const avatar = typeof body.avatar === "string" ? body.avatar.trim() : undefined;
    // TODO: Restrict role changes to ADMIN once team permissions stabilize.
    // For now, users can change their own role freely.
    const VALID_ROLES = ["ADMIN", "PARTNER", "RECRUITER"] as const;
    type Role = (typeof VALID_ROLES)[number];
    const role: Role | undefined =
      typeof body.role === "string" && (VALID_ROLES as readonly string[]).includes(body.role)
        ? (body.role as Role)
        : undefined;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(avatar !== undefined ? { avatar: avatar || null } : {}),
        ...(role !== undefined ? { role } : {}),
      },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT change password
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    if (user.isClientUser) {
      const cu = await prisma.clientUser.findUnique({ where: { id: user.id } });
      if (!cu?.passwordHash) return NextResponse.json({ error: "No password set" }, { status: 400 });
      const valid = await bcrypt.compare(currentPassword, cu.passwordHash);
      if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      const newHash = await bcrypt.hash(newPassword, 12);
      await prisma.clientUser.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      return NextResponse.json({ success: true });
    }

    const u = await prisma.user.findUnique({ where: { id: user.id } });
    if (!u?.passwordHash) return NextResponse.json({ error: "No password set" }, { status: 400 });
    const valid = await bcrypt.compare(currentPassword, u.passwordHash);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
