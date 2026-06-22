import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgContextWithActiveSub, subscriptionErrorResponse } from "@/lib/require-active-sub";
import { logActivity } from "@/lib/activity";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";
import { canAccessJob } from "@/lib/job-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const interview = await prisma.interview.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        job: { select: { id: true, title: true, client: { select: { id: true, name: true } } } },
        creator: { select: { name: true } },
        interviewers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        clientContacts: {
          include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, title: true } } },
        },
        submission: { select: { id: true, stage: { select: { name: true } } } },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(interview);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContextWithActiveSub();
    const { id } = await params;
    const body = await request.json();

    const { title, startTime, endTime, type, status, notes, meetingLink, location, timezone, interviewerIds, clientContactIds } = body;

    // Verify interview exists and belongs to org
    const existing = await prisma.interview.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Job-level RBAC (decisión 2026-06-19 con Nicolás + Ari):
    // - ADMIN: bypass total a través de canAccessJob(role=ADMIN).
    // - USER: estar assigned al job, O ser el creator de la interview
    //   (mismo patrón owner-bypass que submissions PATCH para no
    //   romperle el flow al creador si lo sacan del job).
    if (
      existing.createdBy !== ctx.userId &&
      !(await canAccessJob(existing.jobId, ctx.organizationId, ctx.userId, ctx.role))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update interview fields
    await prisma.interview.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(startTime !== undefined && { startTime: new Date(startTime) }),
        ...(endTime !== undefined && { endTime: new Date(endTime) }),
        ...(type !== undefined && { type }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        ...(meetingLink !== undefined && { meetingLink }),
        ...(location !== undefined && { location }),
        ...(timezone !== undefined && { timezone }),
      },
    });

    // Update interviewers if provided
    if (interviewerIds !== undefined) {
      await prisma.interviewAssignment.deleteMany({
        where: { interviewId: id },
      });
      if (interviewerIds.length > 0) {
        await prisma.interviewAssignment.createMany({
          data: interviewerIds.map((userId: string) => ({
            interviewId: id,
            userId,
          })),
        });
      }
    }

    // Update client contacts if provided
    if (clientContactIds !== undefined) {
      await prisma.interviewClientContact.deleteMany({
        where: { interviewId: id },
      });
      if (clientContactIds.length > 0) {
        await prisma.interviewClientContact.createMany({
          data: clientContactIds.map((contactId: string) => ({
            interviewId: id,
            contactId,
          })),
        });
      }
    }

    await logActivity({
      action: "interview.updated",
      description: `${ctx.userName} updated interview "${title || existing.title}"`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    // Return the full updated interview
    const updated = await prisma.interview.findFirst({
      where: { id },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        creator: { select: { name: true } },
        interviewers: {
          include: { user: { select: { id: true, name: true } } },
        },
        clientContacts: {
          include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, title: true } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContextWithActiveSub();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    // Job-level RBAC (decisión 2026-06-19 con Nicolás + Ari):
    // - ADMIN: bypass total via canAccessJob(role=ADMIN).
    // - USER: estar assigned al job.
    // Pulleo jobId primero para pasarlo al gate.
    const interview = await prisma.interview.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { jobId: true },
    });
    if (!interview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await canAccessJob(interview.jobId, ctx.organizationId, ctx.userId, ctx.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.interview.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const subErr = subscriptionErrorResponse(error);
    if (subErr) return subErr;
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
