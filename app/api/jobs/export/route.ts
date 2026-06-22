import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { toCsv, csvResponse } from "@/lib/csv";

// Export jobs to CSV. Same shape as the candidates export: optional
// ids filter for "export selected", org-scoped, headers aligned with
// the import wizard so it's round-trippable.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // QA CRITICAL privacy 2026-06-22: el export NO filtraba por role.
    // USER con zero assignments podía POST sin body y bajar TODOS los
    // jobs del workspace. Mirror del filter del list endpoint
    // (app/api/jobs/route.ts): ADMIN ve todo, USER solo ve jobs donde
    // tiene assignment.
    const where: any = { organizationId: ctx.organizationId };
    if (ctx.role !== "ADMIN") {
      where.assignments = { some: { userId: ctx.userId } };
    }
    if (ids.length > 0) where.id = { in: ids };

    const jobs = await prisma.job.findMany({
      where,
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const rows = jobs.map((j) => ({
      title: j.title,
      client: j.client?.name || "",
      description: j.description || "",
      salary: j.salary || "",
      location: j.location || "",
      status: j.status,
      createdAt: j.createdAt,
    }));

    const csv = toCsv(
      ["title", "client", "description", "salary", "location", "status", "createdAt"],
      rows
    );
    return csvResponse(`jobs-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (error: any) {
    return new Response(error.message || "Export failed", { status: 500 });
  }
}
