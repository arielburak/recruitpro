import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";

// Job-level RBAC también para bulk delete: la regla universal es
// strictly assignment-based, incluso para ADMIN. Filtramos los ids al
// subset al que el caller TIENE assignment. Lo que no le toca, no se
// borra y se reporta en `skipped` para que el frontend pueda mostrar
// "borraste 3 de 5; los otros 2 no están asignados a vos".

// Bulk-delete jobs. Body: { ids: string[] }.
//
// Same scoping pattern as the candidate bulk-delete: filter ids by
// ctx.organizationId before the delete, return the actual deleted
// count. Job cascade fans through to pipeline stages, submissions,
// interviews, documents, firm engagements, etc.
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

    // Doble gate: (a) job pertenece al org, (b) el caller tiene
    // assignment en ese job. Sin (b), un ADMIN podía borrar en bulk
    // jobs en los que ni siquiera estaba — el bypass clásico.
    const accessible = await prisma.job.findMany({
      where: {
        id: { in: ids },
        organizationId: ctx.organizationId,
        assignments: { some: { userId: ctx.userId } },
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
