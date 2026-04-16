import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { clientSchema } from "@/lib/validations/client";

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

    // Seed default pipeline stages for the client portal
    await prisma.clientPipelineStage.createMany({
      data: [
        { name: "Under Review", order: 0, color: "#f59e0b", isTerminal: false, clientId: client.id },
        { name: "Interviewing", order: 1, color: "#3b82f6", isTerminal: false, clientId: client.id },
        { name: "Offered", order: 2, color: "#8b5cf6", isTerminal: false, clientId: client.id },
        { name: "Placed", order: 3, color: "#10b981", isTerminal: true, kind: "positive", clientId: client.id },
        { name: "Lost", order: 4, color: "#ef4444", isTerminal: true, kind: "negative", clientId: client.id },
        { name: "Rejected", order: 5, color: "#6b7280", isTerminal: true, kind: "negative", clientId: client.id },
      ],
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
