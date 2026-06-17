import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

/**
 * Suggest existing `currentCompany` values from the org's candidates so the UI
 * can show a typeahead. Returns up to 8 distinct matches, case-insensitive.
 *
 *   GET /api/candidates/suggest-companies?q=qser   → ["Qservices", ...]
 *   GET /api/candidates/suggest-companies           → most frequent 8 companies
 */
export async function GET(request: Request) {
  try {
    const ctx = await getOrgContext();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    const where: any = {
      organizationId: ctx.organizationId,
      currentCompany: { not: null },
    };
    if (q) {
      where.currentCompany = { contains: q, mode: "insensitive", not: null };
    }

    const rows = await prisma.candidate.groupBy({
      by: ["currentCompany"],
      where,
      _count: true,
      orderBy: { _count: { currentCompany: "desc" } },
      take: 8,
    });

    const suggestions = rows
      .map((r) => r.currentCompany)
      .filter((c): c is string => !!c && c.trim().length > 0);

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
