import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { toCsv, csvResponse } from "@/lib/csv";

// Export candidates to CSV. Body: { ids?: string[] }.
//
//   - With ids → export exactly those (still org-scoped, so other
//     agencies' ids silently no-op).
//   - Without ids → export every candidate in the agency.
//
// Column order matches what the import wizard expects, so an
// exported file is round-trippable: download → tweak in Excel →
// import back via /import.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];

    const where: any = { organizationId: ctx.organizationId };
    if (ids.length > 0) where.id = { in: ids };

    const candidates = await prisma.candidate.findMany({
      where,
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        linkedIn: true,
        location: true,
        currentTitle: true,
        currentCompany: true,
        source: true,
        skills: true,
        summary: true,
        tags: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const csv = toCsv(
      [
        "firstName",
        "lastName",
        "email",
        "phone",
        "linkedIn",
        "location",
        "currentTitle",
        "currentCompany",
        "source",
        "skills",
        "summary",
        "tags",
        "createdAt",
      ],
      candidates
    );
    return csvResponse(`candidates-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (error: any) {
    return new Response(error.message || "Export failed", { status: 500 });
  }
}
