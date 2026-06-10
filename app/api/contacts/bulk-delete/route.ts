import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { requireAdminResponse } from "@/lib/permissions";

// Bulk-delete contacts. Contacts are org-scoped (Contact.organizationId)
// so a straight deleteMany with both id-in-list and org filter is
// safe — payloads from another agency silently no-op.
//
// Body: { ids: string[] }. Returns { deleted: number }.
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

    const res = await prisma.contact.deleteMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
    });

    await logActivity({
      action: "contact.bulk_deleted",
      description: `${ctx.userName} deleted ${res.count} contact${res.count === 1 ? "" : "s"} in bulk`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ deleted: res.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
