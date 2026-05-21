import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

// Bulk-delete jobs. Body: { ids: string[] }.
//
// Same scoping pattern as the candidate bulk-delete: filter ids by
// ctx.organizationId before the delete, return the actual deleted
// count. Job cascade fans through to pipeline stages, submissions,
// interviews, documents, firm engagements, etc.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const owned = await prisma.job.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    const ownedIds = owned.map((j) => j.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const res = await prisma.job.deleteMany({
      where: { id: { in: ownedIds } },
    });

    await logActivity({
      action: "job.bulk_deleted",
      description: `${ctx.userName} deleted ${res.count} job${res.count === 1 ? "" : "s"} in bulk`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ deleted: res.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
