import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ matches: [] });
    }

    const matches = await prisma.candidate.findMany({
      where: {
        organizationId: ctx.organizationId,
        email: { equals: email, mode: "insensitive" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        currentTitle: true,
        currentCompany: true,
        createdAt: true,
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ matches });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
