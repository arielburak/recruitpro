import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

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
        submission: { select: { id: true, stage: { select: { name: true } } } },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(interview);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const body = await request.json();

    const { title, startTime, endTime, type, status, notes, meetingLink, location, timezone, interviewerIds } = body;

    // Verify interview exists and belongs to org
    const existing = await prisma.interview.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
      // Remove all existing assignments
      await prisma.interviewAssignment.deleteMany({
        where: { interviewId: id },
      });
      // Create new assignments
      if (interviewerIds.length > 0) {
        await prisma.interviewAssignment.createMany({
          data: interviewerIds.map((userId: string) => ({
            interviewId: id,
            userId,
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
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const deleted = await prisma.interview.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
