import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { toCsv, csvResponse } from "@/lib/csv";

// Export clients to CSV. Scoped to the agency's engagement (shared-
// Client model from PR #139), so other agencies' clients never
// surface here even when their ids are passed in.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];

    const where: any = {
      engagedOrganizations: { some: { organizationId: ctx.organizationId } },
    };
    if (ids.length > 0) where.id = { in: ids };

    const clients = await prisma.client.findMany({
      where,
      include: {
        contacts: { where: { isPrimary: true }, select: { firstName: true, lastName: true, email: true, phone: true }, take: 1 },
      },
      orderBy: { name: "asc" },
    });

    const rows = clients.map((c) => {
      const p = c.contacts[0];
      return {
        name: c.name,
        industry: c.industry || "",
        website: c.website || "",
        contactName: p ? `${p.firstName || ""} ${p.lastName || ""}`.trim() : "",
        contactEmail: p?.email || "",
        contactPhone: p?.phone || "",
        notes: c.notes || "",
        createdAt: c.createdAt,
      };
    });

    const csv = toCsv(
      ["name", "industry", "website", "contactName", "contactEmail", "contactPhone", "notes", "createdAt"],
      rows
    );
    return csvResponse(`clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (error: any) {
    return new Response(error.message || "Export failed", { status: 500 });
  }
}
