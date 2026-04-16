import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// PATCH — update a stage (name/color/isTerminal/kind/order) — admin only
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can modify pipeline stages" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.clientPipelineStage.findFirst({
      where: { id, clientId: ctx.clientId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: any = {};
    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      data.name = n;
    }
    if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) data.color = body.color;
    if (typeof body.isTerminal === "boolean") data.isTerminal = body.isTerminal;
    if (body.kind === null || body.kind === "positive" || body.kind === "negative") data.kind = body.kind;

    // Handle reorder if order changed
    if (typeof body.order === "number" && body.order !== existing.order) {
      // Simple reorder: shift other stages
      // Use a transaction
      await prisma.$transaction(async (tx) => {
        const allStages = await tx.clientPipelineStage.findMany({
          where: { clientId: ctx.clientId },
          orderBy: { order: "asc" },
        });
        const without = allStages.filter((s) => s.id !== id);
        const newIndex = Math.max(0, Math.min(body.order, without.length));
        without.splice(newIndex, 0, existing);
        // Two-phase reorder to avoid unique constraint violations
        for (let i = 0; i < without.length; i++) {
          await tx.clientPipelineStage.update({
            where: { id: without[i].id },
            data: { order: 10000 + i }, // safe intermediate offset
          });
        }
        for (let i = 0; i < without.length; i++) {
          await tx.clientPipelineStage.update({
            where: { id: without[i].id },
            data: { order: i, ...(without[i].id === id ? data : {}) },
          });
        }
      });
      const fresh = await prisma.clientPipelineStage.findUnique({ where: { id } });
      return NextResponse.json(fresh);
    }

    const updated = await prisma.clientPipelineStage.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        order: true,
        color: true,
        isTerminal: true,
        kind: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a stage. Only allowed if no submissions reference it.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can modify pipeline stages" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.clientPipelineStage.findFirst({
      where: { id, clientId: ctx.clientId },
      select: { id: true, _count: { select: { submissions: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }
    if (existing._count.submissions > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete stage: ${existing._count.submissions} candidate${existing._count.submissions === 1 ? "" : "s"} currently in this stage. Move them first.`,
        },
        { status: 400 }
      );
    }

    // Ensure at least one stage remains
    const total = await prisma.clientPipelineStage.count({ where: { clientId: ctx.clientId } });
    if (total <= 1) {
      return NextResponse.json({ error: "Must have at least one stage" }, { status: 400 });
    }

    await prisma.clientPipelineStage.delete({ where: { id } });

    // Compact ordering
    const remaining = await prisma.clientPipelineStage.findMany({
      where: { clientId: ctx.clientId },
      orderBy: { order: "asc" },
    });
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < remaining.length; i++) {
        await tx.clientPipelineStage.update({
          where: { id: remaining[i].id },
          data: { order: 10000 + i },
        });
      }
      for (let i = 0; i < remaining.length; i++) {
        await tx.clientPipelineStage.update({
          where: { id: remaining[i].id },
          data: { order: i },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
