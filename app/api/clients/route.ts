import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { clientSchema } from "@/lib/validations/client";
import { DEFAULT_STAGES } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const search = request.nextUrl.searchParams.get("search");
    const pageParam = request.nextUrl.searchParams.get("page");
    const page = parseInt(pageParam || "1");
    const pageSize = 20;
    const paginated = !!pageParam || !!search;

    const where: any = { organizationId: ctx.organizationId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { industry: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    if (!paginated) {
      const clients = await prisma.client.findMany({
        where,
        include: { _count: { select: { jobs: true } } },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(clients);
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: { _count: { select: { jobs: true } } },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json({ clients, total });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const data = clientSchema.parse(body);

    const client = await prisma.client.create({
      data: { ...data, organizationId: ctx.organizationId },
    });

    // Seed the canonical 9 pipeline stages for the client portal
    await prisma.clientPipelineStage.createMany({
      data: DEFAULT_STAGES.map((s, i) => ({
        name: s.name,
        order: i,
        color: s.color,
        isTerminal: s.isTerminal,
        kind: s.kind,
        clientId: client.id,
      })),
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
