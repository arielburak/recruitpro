import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";

// Bulk-delete candidates. Body: { ids: string[] }.
//
// Scoping: every id is filtered through ctx.organizationId before the
// delete fires, so a malicious payload with ids from another agency
// silently no-ops. Returns the count we actually deleted so the UI
// can confirm exactly how many rows went down.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const owned = await prisma.candidate.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    const ownedIds = owned.map((c) => c.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    // Candidate has cascade-on-delete relations to submissions /
    // documents / interviews / activities / comments, so a single
    // deleteMany covers the lot. No application-level fan-out
    // needed.
    const res = await prisma.candidate.deleteMany({
      where: { id: { in: ownedIds } },
    });

    await logActivity({
      action: "candidate.bulk_deleted",
      description: `${ctx.userName} deleted ${res.count} candidate${res.count === 1 ? "" : "s"} in bulk`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ deleted: res.count });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
