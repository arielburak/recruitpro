import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import { logActivity } from "@/lib/activity";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";

// Bulk-delete jobs. Body: { ids: string[] }.
//
// RBAC (decisión 2026-06-19 con Nicolás + Ari):
// - Acceso al endpoint: ADMIN-only (requireAdminResponse).
// - Como ADMIN ahora tiene bypass total a todos los jobs del org, no
//   filtramos por assignment. Cualquier job del org en la lista de
//   ids se borra. Único filter: org match para no permitir cross-org
//   delete via id arbitrario.
//
// Cascade: el delete fans a pipeline stages, submissions, interviews,
// documents, firm engagements, etc.
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
      return NextResponse.json({ deleted: 0 });
    }

    const accessible = await prisma.job.findMany({
      where: {
        id: { in: ids },
        organizationId: ctx.organizationId,
      },
      select: { id: true },
    });
    const accessibleIds = accessible.map((j) => j.id);
    if (accessibleIds.length === 0) {
      return NextResponse.json({ deleted: 0, skipped: ids.length });
    }

    const res = await prisma.job.deleteMany({
      where: { id: { in: accessibleIds } },
    });
    const skipped = ids.length - res.count;

    await logActivity({
      action: "job.bulk_deleted",
      description: `${ctx.userName} deleted ${res.count} job${res.count === 1 ? "" : "s"} in bulk`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ deleted: res.count, skipped });
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
