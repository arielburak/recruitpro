// Deactivate flow para users del agency portal.
//
// GET → impact info: cuántas assignments, candidates owned, active
// submissions, upcoming interviews tiene el user. La UI lo usa para
// el dialog "Deactivate X" — el admin ve qué se queda pendiente
// antes de confirmar.
//
// POST → ejecuta el deactivate con la opción elegida para las
// upcoming interviews (cancel / reassign / keep). Setea isActive=false
// al final.
//
// Por qué endpoint dedicado en lugar de seguir usando el PATCH
// genérico de /api/admin/users: el deactivate tiene side effects
// importantes (cancelar interviews, reasignar, log). Tener su propio
// endpoint hace el contract explícito y deja el PATCH para toggles
// menores (role, isActive=true para reactivar).
//
// reactivar SÍ sigue siendo PATCH del endpoint genérico — es
// no-destructivo y no necesita side effects.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const { userId } = await params;

    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found or already inactive" }, { status: 404 });
    }

    const now = new Date();

    // Counts en paralelo para que el dialog cargue rápido.
    const [
      assignmentsCount,
      ownedCandidatesCount,
      activeSubmissionsCount,
      upcomingInterviews,
    ] = await Promise.all([
      prisma.jobAssignment.count({
        where: { userId, job: { organizationId: ctx.organizationId } },
      }),
      prisma.candidate.count({
        where: { ownerId: userId, organizationId: ctx.organizationId },
      }),
      prisma.candidateSubmission.count({
        where: {
          submittedBy: userId,
          job: { organizationId: ctx.organizationId },
          stage: { name: { notIn: ["Placed", "Lost", "Rejected", "Withdrawn"] } },
        },
      }),
      prisma.interview.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "SCHEDULED",
          startTime: { gt: now },
          OR: [
            { createdBy: userId },
            { interviewers: { some: { userId } } },
          ],
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          jobId: true,
          job: { select: { title: true } },
        },
      }),
    ]);

    // Para reasignar interviews: candidatos de reassignee = otros
    // users ACTIVOS del org. Idealmente filtramos a los que ya
    // comparten al menos 1 job con el user a desactivar (más
    // contexto = mejor pick), pero el dropdown puede mostrar a
    // todos y el admin elige. Simpler para MVP.
    const potentialReassignees = await prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        NOT: { id: userId },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      user,
      counts: {
        assignments: assignmentsCount,
        ownedCandidates: ownedCandidatesCount,
        activeSubmissions: activeSubmissionsCount,
        upcomingInterviews: upcomingInterviews.length,
      },
      upcomingInterviews: upcomingInterviews.map((i) => ({
        id: i.id,
        title: i.title,
        startTime: i.startTime,
        jobTitle: i.job?.title || "",
      })),
      potentialReassignees,
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const { userId } = await params;

    const body = await request.json().catch(() => ({}));
    const upcomingInterviews: "cancel" | "reassign" | "keep" =
      body?.upcomingInterviews === "cancel" ||
      body?.upcomingInterviews === "reassign" ||
      body?.upcomingInterviews === "keep"
        ? body.upcomingInterviews
        : "keep";
    const reassignToUserId: string | null = body?.reassignToUserId ?? null;

    // Guards iguales al PATCH para evitar deactivate del único admin
    // o de uno mismo. Sino podés bloquear toda la org.
    if (userId === ctx.userId) {
      return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found or already inactive" }, { status: 404 });
    }

    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { organizationId: ctx.organizationId, role: "ADMIN", isActive: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "There must be at least one admin" }, { status: 400 });
      }
    }

    // Si reassign: validar que el target está activo en el org.
    let reassignee: { id: string; name: string | null } | null = null;
    if (upcomingInterviews === "reassign") {
      if (!reassignToUserId) {
        return NextResponse.json(
          { error: "reassignToUserId is required when reassigning interviews" },
          { status: 400 },
        );
      }
      reassignee = await prisma.user.findFirst({
        where: {
          id: reassignToUserId,
          organizationId: ctx.organizationId,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      if (!reassignee) {
        return NextResponse.json(
          { error: "Selected teammate is not active in this organization" },
          { status: 400 },
        );
      }
    }

    const now = new Date();

    const upcoming = await prisma.interview.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "SCHEDULED",
        startTime: { gt: now },
        OR: [
          { createdBy: userId },
          { interviewers: { some: { userId } } },
        ],
      },
      select: { id: true, createdBy: true, title: true, jobId: true },
    });

    let interviewsHandled = 0;

    if (upcomingInterviews === "cancel" && upcoming.length > 0) {
      const ids = upcoming.map((i) => i.id);
      const res = await prisma.interview.updateMany({
        where: { id: { in: ids } },
        data: { status: "CANCELLED" },
      });
      interviewsHandled = res.count;
    }

    if (upcomingInterviews === "reassign" && reassignee && upcoming.length > 0) {
      // Para cada interview: (a) si era creador, transferir createdBy;
      // (b) si era interviewer (estaba en InterviewAssignment), reemplazar
      // la row. Una interview puede tener ambos roles para el mismo user.
      await prisma.$transaction(async (tx) => {
        // Transfer creator role
        const asCreator = upcoming.filter((i) => i.createdBy === userId);
        if (asCreator.length > 0) {
          await tx.interview.updateMany({
            where: { id: { in: asCreator.map((i) => i.id) } },
            data: { createdBy: reassignee!.id },
          });
        }
        // Replace interviewer assignments
        await tx.interviewAssignment.deleteMany({
          where: { interviewId: { in: upcoming.map((i) => i.id) }, userId },
        });
        // upsertMany doesn't exist — bulk createMany with skipDuplicates
        // para no chocar con un assignment pre-existente del reassignee.
        await tx.interviewAssignment.createMany({
          data: upcoming.map((i) => ({ interviewId: i.id, userId: reassignee!.id })),
          skipDuplicates: true,
        });
      });
      interviewsHandled = upcoming.length;
    }

    // Finalmente: desactivar el user.
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    await logActivity({
      action: "user.deactivated",
      description:
        `${ctx.userName || "An admin"} deactivated ${user.name || "a user"}` +
        (interviewsHandled > 0
          ? ` (${interviewsHandled} upcoming interviews ${
              upcomingInterviews === "cancel" ? "cancelled" : "reassigned"
            })`
          : ""),
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      metadata: {
        deactivatedUserId: userId,
        upcomingInterviewsChoice: upcomingInterviews,
        interviewsHandled,
        reassignedTo: reassignee?.id ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      interviewsHandled,
      upcomingInterviewsChoice: upcomingInterviews,
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
