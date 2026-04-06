import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { clientSchema } from "@/lib/validations/client";

export async function GET() {
  try {
    const ctx = await getOrgContext();
    const clients = await prisma.client.findMany({
      where: { organizationId: ctx.organizationId },
      include: { _count: { select: { jobs: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(clients);
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

    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
