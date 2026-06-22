import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import { logActivity } from "@/lib/activity";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";

// Bulk-delete clients = bulk disengage. Shared-Client model: the
// Client row itself stays (other agencies may also be engaged with
// it); we just drop the OrganizationClient join for this agency.
// Mirrors the single-row DELETE on /api/clients/[id].
//
// Body: { ids: string[] }. Returns { disengaged: number }.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContextWithActiveSub();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ disengaged: 0 });
    }

    const res = await prisma.organizationClient.deleteMany({
      where: { organizationId: ctx.organizationId, clientId: { in: ids } },
    });

    await logActivity({
      action: "client.bulk_disengaged",
      description: `${ctx.userName} removed ${res.count} client${res.count === 1 ? "" : "s"} from the workspace`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ disengaged: res.count });
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
