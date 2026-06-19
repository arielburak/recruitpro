import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { accessibleAgencyJobIds } from "@/lib/client-job-access";
import { safeErrorMessage } from "@/lib/safe-error";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const body = await request.json();

    // Multi-firm gate: jobId IN visibleAgencyJobIds en vez de
    // job.clientId === ctx.clientId. Ver candidates/route.ts.
    const visibleAgencyJobIds = await accessibleAgencyJobIds(prisma, ctx);
    const existing = await (prisma.interview as any).findFirst({
      where: {
        id,
        jobId: visibleAgencyJobIds.length > 0 ? { in: visibleAgencyJobIds } : "__none__",
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.startTime !== undefined) data.startTime = new Date(body.startTime);
    if (body.endTime !== undefined) data.endTime = new Date(body.endTime);
    if (body.type !== undefined) data.type = body.type;
    if (body.status !== undefined) data.status = body.status;
    if (body.meetingLink !== undefined) data.meetingLink = body.meetingLink || null;
    if (body.location !== undefined) data.location = body.location || null;
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.notes !== undefined) data.notes = body.notes || null;

    const updated = await (prisma.interview as any).update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        type: true,
        status: true,
        meetingLink: true,
        location: true,
        timezone: true,
        notes: true,
        candidate: {
          select: { firstName: true, lastName: true },
        },
        job: {
          select: { title: true },
        },
        creator: {
          select: { name: true },
        },
        interviewers: {
          include: { user: { select: { name: true } } },
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      startTime: updated.startTime,
      endTime: updated.endTime,
      type: updated.type,
      status: updated.status,
      meetingLink: updated.meetingLink,
      location: updated.location,
      timezone: updated.timezone,
      notes: updated.notes,
      candidateName: `${updated.candidate.firstName} ${updated.candidate.lastName}`,
      jobTitle: updated.job.title,
      createdBy: updated.creator?.name || "Unknown",
      interviewers: updated.interviewers.map((a: any) => a.user.name),
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
