import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
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

    const owned = await prisma.candidate.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    const ownedIds = owned.map((c) => c.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    // Audit 2026-06-23: el comment viejo decía "Candidate has cascade-
    // on-delete relations to submissions" — FALSO. CandidateSubmission,
    // Comment (con candidateId/submissionId) y Placement NO cascadean
    // desde Candidate. Bulk-delete con cualquiera de esas dependencias
    // tiraba FK 500. Fan-out manual en tx para borrar primero las
    // dependencias no-cascade, después la Candidate.
    //
    // Cascades existentes (no hace falta tocarlas): Document, Activity,
    // Interview (por candidateId), SubmissionDocument, CandidateRating
    // (por submission), CalendarEvent SetNull.
    const submissions = await prisma.candidateSubmission.findMany({
      where: { candidateId: { in: ownedIds } },
      select: { id: true },
    });
    const submissionIds = submissions.map((s) => s.id);

    const txOps: any[] = [];
    if (submissionIds.length > 0) {
      txOps.push(
        prisma.comment.deleteMany({
          where: { submissionId: { in: submissionIds } },
        }),
        prisma.placement.deleteMany({
          where: { submissionId: { in: submissionIds } },
        }),
      );
    }
    txOps.push(
      prisma.comment.deleteMany({ where: { candidateId: { in: ownedIds } } }),
      prisma.candidateSubmission.deleteMany({
        where: { candidateId: { in: ownedIds } },
      }),
    );

    const res = await prisma.$transaction([
      ...txOps,
      prisma.candidate.deleteMany({ where: { id: { in: ownedIds } } }),
    ]);
    const deletedCount = res[res.length - 1].count;

    await logActivity({
      action: "candidate.bulk_deleted",
      description: `${ctx.userName} deleted ${deletedCount} candidate${deletedCount === 1 ? "" : "s"} in bulk`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ deleted: deletedCount });
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
