import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { accessibleAgencyJobIds } from "@/lib/client-job-access";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const { searchParams } = request.nextUrl;
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    // Multi-firm: el gate correcto es jobId IN visibleAgencyJobIds
    // (FirmEngagements ACCEPTED en ClientJobs accesibles). Filtrar por
    // job.clientId === ctx.clientId rompia cuando habia 2+ agencias
    // engaged con el mismo ClientJob porque cada agencia tiene su
    // propio Client record. Ver /api/client-portal/candidates/route.ts
    // para el rationale completo.
    const visibleAgencyJobIds = await accessibleAgencyJobIds(prisma, ctx);
    const where: any = {
      jobId: visibleAgencyJobIds.length > 0 ? { in: visibleAgencyJobIds } : "__none__",
    };

    if (start || end) {
      where.startTime = {};
      if (start) where.startTime.gte = new Date(start);
      if (end) where.startTime.lte = new Date(end);
    }

    const interviews = await prisma.interview.findMany({
      where,
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
      orderBy: { startTime: "asc" },
    });

    const result = interviews.map((i) => ({
      id: i.id,
      title: i.title,
      startTime: i.startTime,
      endTime: i.endTime,
      type: i.type,
      status: i.status,
      meetingLink: i.meetingLink,
      location: i.location,
      timezone: i.timezone,
      notes: i.notes,
      candidateName: `${i.candidate.firstName} ${i.candidate.lastName}`,
      jobTitle: i.job.title,
      createdBy: i.creator?.name || "Unknown",
      interviewers: i.interviewers.map((a) => a.user.name),
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    const body = await request.json();

    const {
      title,
      startTime,
      endTime,
      type,
      candidateId,
      submissionId,
      meetingLink,
      location,
      timezone,
      notes,
      teamMemberIds,
    } = body;

    if (!title || !startTime || !endTime || !candidateId || !submissionId) {
      return NextResponse.json(
        { error: "Title, times, candidate, and submission are required" },
        { status: 400 }
      );
    }

    // Verify submission via visibleAgencyJobIds (multi-firm safe).
    const visibleAgencyJobIds = await accessibleAgencyJobIds(prisma, ctx);
    const submission = await prisma.candidateSubmission.findFirst({
      where: {
        id: submissionId,
        isSharedWithClient: true,
        jobId: visibleAgencyJobIds.length > 0 ? { in: visibleAgencyJobIds } : "__none__",
      },
      include: {
        job: { select: { id: true, organizationId: true } },
      },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found or not shared with you" }, { status: 404 });
    }

    // We need a createdBy userId — use the first user from the org that owns the job
    // (since Interview.createdBy requires a User, not a ClientUser)
    const orgUser = await prisma.user.findFirst({
      where: { organizationId: submission.job.organizationId, isActive: true },
      select: { id: true },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "No organization user found" }, { status: 500 });
    }

    const interview = await (prisma.interview as any).create({
      data: {
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        type: type || "VIDEO",
        notes: notes || null,
        meetingLink: meetingLink || null,
        location: location || null,
        timezone: timezone || "America/Argentina/Buenos_Aires",
        submissionId,
        jobId: submission.job.id,
        candidateId,
        organizationId: submission.job.organizationId,
        createdBy: orgUser.id,
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        type: true,
        status: true,
      },
    });

    return NextResponse.json(interview, { status: 201 });
  } catch (error: any) {
    console.error("[client-portal/interviews] Create error:", error);
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
