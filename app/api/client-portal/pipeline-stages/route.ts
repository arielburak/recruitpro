import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// GET — list all pipeline stages for this client (ordered)
export async function GET() {
  try {
    const ctx = await getClientContext();

    const stages = await prisma.clientPipelineStage.findMany({
      where: { clientId: ctx.clientId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        color: true,
        isTerminal: true,
        kind: true,
      },
    });

    return NextResponse.json(stages);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

// POST — create a new stage at the end (admin only)
export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can modify pipeline stages" }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#f59e0b";
    const isTerminal = body.isTerminal === true;
    const kind = body.kind === "positive" || body.kind === "negative" ? body.kind : null;

    // Find the highest order
    const last = await prisma.clientPipelineStage.findFirst({
      where: { clientId: ctx.clientId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const stage = await prisma.clientPipelineStage.create({
      data: {
        name,
        color,
        order: nextOrder,
        isTerminal,
        kind,
        clientId: ctx.clientId,
      },
      select: {
        id: true,
        name: true,
        order: true,
        color: true,
        isTerminal: true,
        kind: true,
      },
    });

    return NextResponse.json(stage, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
