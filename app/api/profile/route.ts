import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { ensureClientHasActiveAdmin } from "@/lib/client-portal-roles";

// GET my profile (works for both staffing and client users)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user.isClientUser) {
      // Look up by id first, then fall back to email (same as getClientContext)
      let cu = await prisma.clientUser.findUnique({
        where: { id: user.id },
        select: {
          id: true, clientId: true, name: true, email: true, title: true, role: true, isActive: true, createdAt: true,
          client: { select: { name: true, industry: true } },
        },
      });
      if (!cu && user.email) {
        cu = await prisma.clientUser.findFirst({
          where: { email: user.email, isActive: true },
          select: {
            id: true, clientId: true, name: true, email: true, title: true, role: true, isActive: true, createdAt: true,
            client: { select: { name: true, industry: true } },
          },
        });
      }
      if (!cu) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Self-heal: if this user's client has nobody managing the
      // portal (zero active ADMINs), promote the oldest member to
      // ADMIN — and if that's the caller themselves, return the
      // promoted role so the UI unlocks immediately without a
      // second round-trip.
      const promotedId = await ensureClientHasActiveAdmin(prisma, cu.clientId);
      const effectiveRole = promotedId === cu.id ? "ADMIN" : cu.role;

      return NextResponse.json({
        type: "client" as const,
        id: cu.id,
        name: cu.name,
        email: cu.email,
        title: cu.title,
        role: effectiveRole,
        companyName: cu.client.name,
        industry: cu.client.industry,
        createdAt: cu.createdAt,
      });
    }

    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, name: true, email: true, title: true, role: true, avatar: true, isActive: true, createdAt: true,
        organization: { select: { name: true } },
      },
    });
    if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      type: "staffing" as const,
      id: u.id,
      name: u.name,
      email: u.email,
      title: u.title,
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

      // Find the ClientUser (id fallback to email)
      let target = await prisma.clientUser.findUnique({ where: { id: user.id }, select: { id: true } });
      if (!target && user.email) {
        target = await prisma.clientUser.findFirst({ where: { email: user.email, isActive: true }, select: { id: true } });
      }
      if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const updated = await prisma.clientUser.update({
        where: { id: target.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(title !== undefined ? { title: title || null } : {}),
        },
        select: { id: true, name: true, email: true, title: true, role: true },
      });
      return NextResponse.json(updated);
    }

    const avatar = typeof body.avatar === "string" ? body.avatar.trim() : undefined;
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    // Role is NOT editable via the profile endpoint. Only admins can change
    // roles via the /api/admin/users (staffing) or /api/client-portal/team (client) endpoints.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(title !== undefined ? { title: title || null } : {}),
        ...(avatar !== undefined ? { avatar: avatar || null } : {}),
      },
      select: { id: true, name: true, email: true, title: true, avatar: true, role: true },
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
