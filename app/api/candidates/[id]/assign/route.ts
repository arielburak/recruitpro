import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { canAccessJob } from "@/lib/job-access";
import { safeErrorMessage } from "@/lib/safe-error";

// GET - fetch available jobs (not already assigned)
//
// SECURITY 2026-06-17: la lista solo incluye Jobs a los que ESTE user
// esta asignado. Antes devolviamos todos los Jobs OPEN/ACTIVE del org,
// y un USER sin acceso a un Job podia agregarle candidatos via la UI
// del "Assign to Job" dialog. Mismo patron del #3 critico (canAccessJob
// para PATCH/DELETE de submissions) — aca lo aplicamos al CREATE side.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Get jobs this candidate is already submitted to
    const existingSubmissions = await prisma.candidateSubmission.findMany({
      where: { candidateId: id },
      select: { jobId: true },
    });
    const existingJobIds = existingSubmissions.map((s) => s.jobId);

    // Get open/active jobs not yet assigned AND a los que el user tiene
    // acceso. Visibilidad:
    // - ADMIN: ve todos los jobs OPEN/ACTIVE del org no asignados al
    //   candidato. (Decisión 2026-06-19 con Nicolás + Ari).
    // - USER: solo los jobs donde figura como JobAssignment.
    const availableJobs = await prisma.job.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ["OPEN", "ACTIVE"] },
        id: { notIn: existingJobIds },
        ...(ctx.role !== "ADMIN" && {
          assignments: { some: { userId: ctx.userId } },
        }),
      },
      include: {
        client: { select: { name: true } },
        stages: { orderBy: { order: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(availableJobs);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// POST - assign candidate to multiple jobs
//
// SECURITY 2026-06-17: cada jobId del array se valida con canAccessJob
// antes de crear la submission. Si el user no tiene acceso a alguno, lo
// saltamos (no devolvemos 403 — esa lista solo incluiria jobs propios
// si el frontend uso el GET sano arriba). El count devuelto refleja
// solo las submissions efectivamente creadas. Anti-IDOR para el caso
// del client que arma el body a mano con un jobId arbitrario.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const { jobIds } = await request.json();

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: "No jobs selected" }, { status: 400 });
    }

    // Verify candidate belongs to org
    const candidate = await prisma.candidate.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // For each job, get the first pipeline stage and create submission
    const results = [];
    const blockedJobIds: string[] = [];
    for (const jobId of jobIds) {
      // Anti-IDOR: validar acceso por cada jobId del body. Antes la
      // unica defensa era el filtro del GET, que un cliente custom
      // podia saltearse mandando un POST directo.
      const allowed = await canAccessJob(jobId, ctx.organizationId, ctx.userId, ctx.role);
      if (!allowed) {
        blockedJobIds.push(jobId);
        continue;
      }

      const firstStage = await prisma.pipelineStage.findFirst({
        where: { jobId },
        orderBy: { order: "asc" },
      });

      if (!firstStage) continue;

      try {
        const submission = await prisma.candidateSubmission.create({
          data: {
            candidateId: id,
            jobId,
            stageId: firstStage.id,
            submittedBy: ctx.userId,
          },
        });
        results.push(submission);

        await logActivity({
          action: "candidate.submitted",
          description: `${ctx.userName} submitted ${candidate.firstName} ${candidate.lastName} to a job`,
          userId: ctx.userId,
          candidateId: id,
          organizationId: ctx.organizationId,
        });
      } catch (e: any) {
        // Skip duplicates
        if (e.code === "P2002") continue;
        throw e;
      }
    }

    // Si TODOS los jobIds fueron rechazados por permisos, devolvemos
    // 403 explicito — sino el cliente piensa que "0 created" fue por
    // duplicado y muestra mensaje confuso. Si fue mixto (algunos OK,
    // algunos bloqueados), devolvemos el count + lista de bloqueados.
    if (results.length === 0 && blockedJobIds.length === jobIds.length) {
      return NextResponse.json(
        { error: "You don't have access to any of the selected jobs." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { created: results.length, blocked: blockedJobIds.length || undefined },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
