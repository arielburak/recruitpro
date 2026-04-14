import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const status = searchParams.get("status");

    const where: any = { organizationId: ctx.organizationId };

    if (start && end) {
      where.startTime = {
        gte: new Date(start),
        lte: new Date(end),
      };
    }

    if (status) {
      where.status = status;
    }

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        creator: { select: { name: true } },
        interviewers: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json(interviews);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const {
      title,
      startTime,
      endTime,
      type,
      candidateId,
      jobId,
      submissionId,
      notes,
      meetingLink,
      location,
      timezone,
      interviewerIds,
    } = body;

    if (!title || !startTime || !endTime || !candidateId || !jobId || !submissionId) {
      return NextResponse.json(
        { error: "Title, times, candidate, job, and submission are required" },
        { status: 400 }
      );
    }

    // Verify submission belongs to org
    const submission = await prisma.candidateSubmission.findFirst({
      where: {
        id: submissionId,
        job: { organizationId: ctx.organizationId },
      },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const interview = await prisma.interview.create({
      data: {
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        type: type || "VIDEO",
        notes,
        meetingLink,
        location,
        timezone: timezone || "America/Argentina/Buenos_Aires",
        submissionId,
        jobId,
        candidateId,
        organizationId: ctx.organizationId,
        createdBy: ctx.userId,
        interviewers: interviewerIds?.length
          ? {
              create: interviewerIds.map((userId: string) => ({ userId })),
            }
          : undefined,
      },
      include: {
        candidate: { select: { firstName: true, lastName: true } },
        job: { select: { title: true } },
      },
    });

    await logActivity({
      action: "interview.scheduled",
      description: `${ctx.userName} scheduled interview "${title}" with ${interview.candidate.firstName} ${interview.candidate.lastName} for ${interview.job.title}`,
      userId: ctx.userId,
      candidateId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(interview, { status: 201 });
  } catch (error: any) {
    console.error("Interview create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
