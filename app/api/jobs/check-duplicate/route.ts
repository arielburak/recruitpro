import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

const MATCH_SELECT = {
  id: true,
  title: true,
  location: true,
  status: true,
  createdAt: true,
  client: { select: { id: true, name: true } },
} as const;

/**
 * A job counts as a duplicate when it has the same (clientId, title)
 * within the firm. We ignore status — an open or closed prior job is
 * still worth surfacing so the recruiter can reopen / reuse rather
 * than blindly recreating work.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const params = request.nextUrl.searchParams;
    const title = params.get("title")?.trim() || "";
    const clientId = params.get("clientId")?.trim() || "";

    if (!title || !clientId) {
      return NextResponse.json({ matches: [] });
    }

    const matches = await prisma.job.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        title: { equals: title, mode: "insensitive" },
      },
      select: MATCH_SELECT,
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ matches });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
