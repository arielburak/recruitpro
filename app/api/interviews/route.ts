import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { sendInterviewInviteEmail, sendInterviewInviteToClientContact } from "@/lib/email";
import { getValidAccessToken, createGoogleCalendarEvent } from "@/lib/google-calendar";
import {
  getValidAccessToken as getMsAccessToken,
  createMicrosoftCalendarEvent,
} from "@/lib/microsoft-calendar";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const status = searchParams.get("status");

    // The calendar is a per-user view: each recruiter only sees the
    // interviews they own (createdBy) or were invited to as an
    // interviewer. The full org-wide list lives elsewhere (e.g. the
    // job-level Interviews tab) where that wider scope makes sense.
    const where: any = {
      organizationId: ctx.organizationId,
      OR: [
        { createdBy: ctx.userId },
        { interviewers: { some: { userId: ctx.userId } } },
      ],
    };

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
        clientContacts: {
          include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, title: true } } },
        },
        // Count attachments so the calendar chip can show a paperclip
        // indicator without forcing the recruiter to open the
        // interview just to find out it has files.
        _count: { select: { documents: true } },
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
      meetingLink: manualMeetingLink,
      location,
      timezone,
      interviewerIds,
      clientContactIds,
      platform,
      // When false, skip sending the candidate + client-contact invite
      // emails — the interview is recorded in the ATS only. Defaults to
      // true so existing callers (/calendar form) keep their current
      // behavior. The kanban "schedule on drop" flow opts out: that
      // dialog is for tracking, not for inviting.
      notifyAttendees = true,
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

    const interviewTz = timezone || "America/Argentina/Buenos_Aires";

    // Auto-generate meeting link based on selected platform. Falls back to
    // the manual link (or no link) if the user hasn't connected the provider.
    let meetingLink = manualMeetingLink || "";
    let googleEventId: string | null = null;
    let googleCalendarOwnerId: string | null = null;
    let microsoftEventId: string | null = null;
    let microsoftCalendarOwnerId: string | null = null;

    async function collectAttendees() {
      const attendees: { email: string; displayName?: string }[] = [];

      const candidateData = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (candidateData?.email) {
        attendees.push({
          email: candidateData.email,
          displayName: `${candidateData.firstName} ${candidateData.lastName}`,
        });
      }

      if (clientContactIds?.length) {
        const contacts = await prisma.contact.findMany({
          where: { id: { in: clientContactIds } },
          select: { email: true, firstName: true, lastName: true },
        });
        for (const c of contacts) {
          if (c.email) {
            attendees.push({
              email: c.email,
              displayName: `${c.firstName} ${c.lastName}`,
            });
          }
        }
      }

      if (interviewerIds?.length) {
        const interviewerUsers = await prisma.user.findMany({
          where: { id: { in: interviewerIds } },
          select: { email: true, name: true },
        });
        for (const u of interviewerUsers) {
          attendees.push({ email: u.email, displayName: u.name });
        }
      }

      return { attendees, candidateData };
    }

    if (platform === "google_meet" && !manualMeetingLink) {
      try {
        const accessToken = await getValidAccessToken(ctx.userId);
        if (accessToken) {
          const { attendees, candidateData } = await collectAttendees();
          const calEvent = await createGoogleCalendarEvent({
            accessToken,
            summary: title || `Interview - ${candidateData?.firstName || "Candidate"}`,
            description: notes || undefined,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            timezone: interviewTz,
            attendees,
          });
          meetingLink = calEvent.meetLink;
          googleEventId = calEvent.eventId;
          googleCalendarOwnerId = ctx.userId;
        }
      } catch (calErr) {
        console.error("[interview] Failed to create Google Calendar event:", calErr);
        // Continue without Meet link — don't block interview creation
      }
    }

    if (platform === "microsoft_teams" && !manualMeetingLink) {
      try {
        const accessToken = await getMsAccessToken(ctx.userId);
        if (accessToken) {
          const { attendees, candidateData } = await collectAttendees();
          const calEvent = await createMicrosoftCalendarEvent({
            accessToken,
            summary: title || `Interview - ${candidateData?.firstName || "Candidate"}`,
            description: notes || undefined,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            timezone: interviewTz,
            attendees,
          });
          meetingLink = calEvent.meetLink;
          microsoftEventId = calEvent.eventId;
          microsoftCalendarOwnerId = ctx.userId;
        }
      } catch (calErr) {
        console.error("[interview] Failed to create Microsoft Calendar event:", calErr);
        // Continue without Teams link — don't block interview creation
      }
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
        timezone: interviewTz,
        submissionId,
        jobId,
        candidateId,
        organizationId: ctx.organizationId,
        createdBy: ctx.userId,
        googleEventId,
        googleCalendarOwnerId,
        microsoftEventId,
        microsoftCalendarOwnerId,
        interviewers: interviewerIds?.length
          ? {
              create: interviewerIds.map((userId: string) => ({ userId })),
            }
          : undefined,
        clientContacts: clientContactIds?.length
          ? {
              create: clientContactIds.map((contactId: string) => ({ contactId })),
            }
          : undefined,
      },
      include: {
        candidate: { select: { firstName: true, lastName: true, email: true } },
        job: { select: { title: true, client: { select: { name: true } } } },
        clientContacts: {
          include: { contact: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    });

    await logActivity({
      action: "interview.scheduled",
      description: `${ctx.userName} scheduled interview "${title}" with ${interview.candidate.firstName} ${interview.candidate.lastName} for ${interview.job.title}`,
      userId: ctx.userId,
      candidateId,
      organizationId: ctx.organizationId,
    });

    // Send invite emails — gated on notifyAttendees so the kanban
    // "log interview" flow can register the event without spamming the
    // candidate. The /calendar create form keeps the default (true).
    if (!notifyAttendees) {
      return NextResponse.json(interview, { status: 201 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const emailDateOpts = {
      weekday: "long" as const, year: "numeric" as const, month: "long" as const, day: "numeric" as const,
      timeZone: interviewTz,
    };
    const emailTimeOpts = {
      hour: "numeric" as const, minute: "2-digit" as const, hour12: true as const,
      timeZone: interviewTz,
    };
    const formattedDate = start.toLocaleDateString("en-US", emailDateOpts);
    const formattedStart = start.toLocaleTimeString("en-US", emailTimeOpts);
    const formattedEnd = end.toLocaleTimeString("en-US", emailTimeOpts);

    // Get org name for client contact emails
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });

    // 1) Email to candidate
    if (interview.candidate.email) {
      try {
        await sendInterviewInviteEmail({
          to: interview.candidate.email,
          candidateName: interview.candidate.firstName,
          jobTitle: interview.job.title,
          clientName: interview.job.client?.name || "",
          interviewDate: formattedDate,
          interviewTime: formattedStart,
          interviewEndTime: formattedEnd,
          timezone: interviewTz,
          interviewType: type || "VIDEO",
          meetingLink: meetingLink || undefined,
          location: location || undefined,
          notes: notes || undefined,
          recruiterName: ctx.userName,
        });
      } catch (emailErr) {
        console.error("[interview] Failed to send candidate invite:", emailErr);
      }
    }

    // 2) Emails to client contacts (hiring company)
    if (interview.clientContacts?.length > 0) {
      const candidateFullName = `${interview.candidate.firstName} ${interview.candidate.lastName}`;
      for (const cc of interview.clientContacts) {
        if (cc.contact.email) {
          try {
            await sendInterviewInviteToClientContact({
              to: cc.contact.email,
              contactName: cc.contact.firstName,
              candidateName: candidateFullName,
              jobTitle: interview.job.title,
              clientName: interview.job.client?.name || "",
              interviewDate: formattedDate,
              interviewTime: formattedStart,
              interviewEndTime: formattedEnd,
              timezone: interviewTz,
              interviewType: type || "VIDEO",
              meetingLink: meetingLink || undefined,
              location: location || undefined,
              notes: notes || undefined,
              recruiterName: ctx.userName,
              firmName: org?.name || "Our recruiting team",
            });
          } catch (emailErr) {
            console.error(`[interview] Failed to send client contact invite to ${cc.contact.email}:`, emailErr);
          }
        }
      }
    }

    return NextResponse.json(interview, { status: 201 });
  } catch (error: any) {
    console.error("Interview create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
