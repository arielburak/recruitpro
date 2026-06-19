import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendJobAssignedEmail } from "@/lib/email";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";
import { canAccessJob } from "@/lib/job-access";
import { notifyUserIfActive } from "@/lib/notify-user";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Verify job belongs to org
    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Filtramos assignments cuyo user fue desactivado. La row se
    // preserva en la DB para reactivación / historial, pero NO debe
    // aparecer en la lista "Team on this job" — sino el admin
    // queja "por qué sigue figurando si lo desactivé?". Si más
    // adelante hace falta ver ex-members del job, lo metemos
    // detrás de un toggle "Show inactive".
    const assignments = await prisma.jobAssignment.findMany({
      where: { jobId: id, user: { isActive: true } },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    return NextResponse.json(assignments);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContextWithActiveSub();
    const { id } = await params;

    // Job-level RBAC (decisión 2026-06-19 con Nicolás + Ari):
    // - ADMIN: bypass total — puede sumar gente a cualquier job del org.
    // - USER: solo a jobs en los que está assigned. Si no ve el job,
    //   no debería poder modificarle el equipo.
    if (!(await canAccessJob(id, ctx.organizationId, ctx.userId, ctx.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Verify job belongs to org. We pull title + client info up
    // front because we use them for the notification + email below.
    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        title: true,
        client: { select: { name: true } },
      },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // Verify user belongs to same org + está activo. Si está
    // desactivado no debería poder ser asignado a nuevos jobs (su
    // historial sigue, pero NO sumamos work futuro).
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, email: true, title: true },
    });
    if (!user) return NextResponse.json({ error: "User not found or inactive" }, { status: 404 });

    const assignment = await prisma.jobAssignment.create({
      data: { jobId: id, userId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    // Notify the newly-assigned recruiter (don't notify self-
    // assigns — opening your own job and clicking "assign me" is
    // already its own confirmation). Both in-app and mail per the
    // user's rule: "Notificación + mail al agregarme a un job".
    // Fire-and-forget so a flaky Resend doesn't fail the assign.
    if (userId !== ctx.userId) {
      const baseUrl =
        process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
      const jobUrl = `${baseUrl}/jobs/${id}`;
      const contextLine = [user.title, job.client?.name]
        .filter(Boolean)
        .join(" · ");

      // notifyUserIfActive centraliza el re-check de isActive. Aunque
      // el user lookup arriba ya filtra isActive, esto cubre la race
      // teórica donde el admin desactiva entre el lookup y el envío.
      // Doble defensa, costo nulo.
      void notifyUserIfActive(userId, {
        notification: {
          type: "job_assigned",
          title: `${ctx.userName || "A teammate"} added you to ${job.title}`,
          body: contextLine || null,
          link: `/jobs/${id}`,
        },
        email: async (recipient) => {
          await sendJobAssignedEmail({
            to: recipient.email,
            recipientName: recipient.name || "",
            assignerName: ctx.userName || "A teammate",
            jobTitle: job.title,
            clientName: job.client?.name || null,
            role: user.title || null,
            jobUrl,
          });
        },
      });
    }

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    // Handle duplicate assignment
    if (error.code === "P2002") {
      return NextResponse.json({ error: "User is already assigned to this job" }, { status: 409 });
    }
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    // Job-level RBAC (decisión 2026-06-19 con Nicolás + Ari):
    // - ADMIN: bypass total. Puede sacar gente de cualquier job del
    //   org. requireAdminResponse arriba ya gateó al USER.
    // - USER: no llega acá (DELETE es ADMIN-only).
    if (!(await canAccessJob(id, ctx.organizationId, ctx.userId, ctx.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Verify job belongs to org
    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    await prisma.jobAssignment.deleteMany({
      where: { jobId: id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
