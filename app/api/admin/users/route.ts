import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";
import { checkSeatAvailability } from "@/lib/seat-availability";
// recalculateAndSyncSeats deprecado en pool seat model (2026-06-22):
// create/reactivate/delete YA NO mueven seats automático. El admin
// compra el pool explícitamente desde Manage seats. El gate de
// disponibilidad se enforced acá con checkSeatAvailability.

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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
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

    // Pool seat check antes del create — si la org está ACTIVE y no
    // hay seats disponibles, bloquear. TRIAL/COMP pasan libre.
    const seatCheck = await checkSeatAvailability(ctx.organizationId);
    if (!seatCheck.ok) {
      return NextResponse.json(
        {
          error: seatCheck.message,
          code: "seat_pool_full",
          current: seatCheck.current,
          pool: seatCheck.pool,
        },
        { status: 402 },
      );
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

    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
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

    // Reactivate: chequear pool. Si está siendo reactivado y no hay
    // seat libre, bloquear. Deactivate y role change pasan libre.
    if (isActive === true && user.isActive === false) {
      const seatCheck = await checkSeatAvailability(ctx.organizationId);
      if (!seatCheck.ok) {
        return NextResponse.json(
          {
            error: seatCheck.message,
            code: "seat_pool_full",
            current: seatCheck.current,
            pool: seatCheck.pool,
          },
          { status: 402 },
        );
      }
    }

    const updateData: any = {};
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (normalizedRole) updateData.role = normalizedRole;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    // Pool seat model 2026-06-22: deactivate libera el seat al pool
    // (billing igual). Reactivate ocupa uno (checkeado arriba). NO
    // se modifica subscription.seats automático.

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// DELETE — eliminado a propósito (audit 2026-06-23).
//
// El schema NO tiene cascade desde User a JobAssignment, Comment,
// CandidateRating, InterviewAssignment, etc. Un hard-delete de un User
// con cualquier work asociado revienta con FK errors (500) o, peor, deja
// las rows pendientes con un userId que ya no resuelve (silent orphan
// attribution: comments aparecen como "?" en UI, performance metrics
// crashean).
//
// Para sacar a alguien usar PATCH /api/admin/users con { isActive: false }
// — soft-delete vía DeactivateUserDialog que ya pide qué hacer con las
// interviews futuras + libera el seat al pool. La distancia entre
// "Deactivate" y "Remove permanently" era invisible en el menú viejo
// y el undocumented hard-delete se llevaba el trabajo de meses.
//
// Si en algún momento necesitamos hard-delete real (GDPR right-to-be-
// forgotten), va con flow específico + cascade migration + doble
// confirmación. Mientras tanto, mejor que no exista.
