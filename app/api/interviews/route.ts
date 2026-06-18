import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { sendInterviewInviteEmail, sendInterviewInviteToClientContact } from "@/lib/email";
import { requireVerifiedEmail } from "@/lib/require-verified-email";
import { canAccessJob } from "@/lib/job-access";
import { getValidAccessToken, createGoogleCalendarEvent } from "@/lib/google-calendar";
import {
  getValidAccessToken as getMsAccessToken,
  createMicrosoftCalendarEvent,
} from "@/lib/microsoft-calendar";
import { safeErrorMessage } from "@/lib/safe-error";

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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

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

    // Job-level RBAC: solo recruiters asignados al job pueden agendar
    // interviews. Sin esto, cualquier USER puede crear interviews en
    // jobs que ni siquiera ve en su lista — incoherente con el resto
    // del sistema (submissions, comments) donde canAccessJob es
    // estrictamente assignment-based.
    if (!(await canAccessJob(jobId, ctx.organizationId, ctx.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const interviewTz = timezone || "America/Argentina/Buenos_Aires";

    // Auto-generate meeting link based on selected platform. Falls back to
    // the manual link (or no link) if the user hasn't connected the provider.
    let meetingLink = manualMeetingLink || "";
    let googleEventId: string | null = null;
    let googleCalendarOwnerId: string | null = null;
    let microsoftEventId: string | null = null;
    let microsoftCalendarOwnerId: string | null = null;

    // Calendar attendees policy (MVP):
    //
    // - Client contacts NEVER get added as calendar attendees. The
    //   agency's policy is "client doesn't get an invite from us";
    //   the InterviewClientContact rows still get persisted for
    //   tracking purposes, they just don't reach Google/MS Graph.
    // - Candidate is opt-in via `notifyAttendees`. When false (the
    //   default for client-interview tracking), no one external is
    //   added — the event is just a block on the recruiter's own
    //   calendar.
    // - Interviewers (internal agency staff) are always included so
    //   they get the standard "you're on this meeting" experience.
    async function collectAttendees() {
      const attendees: { email: string; displayName?: string }[] = [];

      const candidateData = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (notifyAttendees && candidateData?.email) {
        attendees.push({
          email: candidateData.email,
          displayName: `${candidateData.firstName} ${candidateData.lastName}`,
        });
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

    // Mirror the event to the OTHER calendar (silent, no attendees)
    // when the recruiter has both Google and Outlook connected. The
    // candidate / client only ever get a single invite — from the
    // platform that owns the Meet/Teams link — but the recruiter
    // sees the interview as a block in both of their personal
    // calendars. Skips if no integration is connected for that side
    // or if we already created the primary event on it.
    async function mirrorTo(other: "google" | "microsoft") {
      try {
        if (other === "google" && !googleEventId) {
          const t = await getValidAccessToken(ctx.userId);
          if (!t) return;
          const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
            method: "POST",
            headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: title,
              description: notes || undefined,
              start: { dateTime: new Date(startTime).toISOString(), timeZone: interviewTz },
              end: { dateTime: new Date(endTime).toISOString(), timeZone: interviewTz },
              reminders: { useDefault: true },
            }),
          });
          if (res.ok) {
            const d = await res.json();
            googleEventId = d.id;
            googleCalendarOwnerId = ctx.userId;
          }
        }
        if (other === "microsoft" && !microsoftEventId) {
          const t = await getMsAccessToken(ctx.userId);
          if (!t) return;
          const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${t}`,
              "Content-Type": "application/json",
              Prefer: `outlook.timezone="${interviewTz}"`,
            },
            body: JSON.stringify({
              subject: title,
              body: { contentType: "Text", content: notes || "" },
              start: { dateTime: new Date(startTime).toISOString(), timeZone: interviewTz },
              end: { dateTime: new Date(endTime).toISOString(), timeZone: interviewTz },
              isReminderOn: true,
              reminderMinutesBeforeStart: 10,
            }),
          });
          if (res.ok) {
            const d = await res.json();
            microsoftEventId = d.id;
            microsoftCalendarOwnerId = ctx.userId;
          }
        }
      } catch (e) {
        // Mirror failures are non-fatal — the primary event already
        // landed and the interview row is about to be created. The
        // recruiter just won't see this one in their secondary
        // calendar, which is a soft degradation, not a broken flow.
        console.error("[interview] mirror failed:", e);
      }
    }
    // If primary event was Google → mirror to MS, and vice versa.
    // Manual-link / no-platform interviews mirror to both, so the
    // recruiter still gets the block in whichever calendar(s) they
    // have connected.
    if (googleEventId && !microsoftEventId) await mirrorTo("microsoft");
    if (microsoftEventId && !googleEventId) await mirrorTo("google");
    if (!googleEventId && !microsoftEventId) {
      await mirrorTo("google");
      await mirrorTo("microsoft");
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
        // Record the user's intent at create time. The calendar UI
        // uses this to mark "internal only" interviews so a
        // recruiter scanning their week can tell whether the
        // candidate was actually emailed.
        inviteSent: Boolean(notifyAttendees),
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

    // Hardening del contador de Interviews (#9 del roadmap): siempre
    // stampear submissionId + interviewId en metadata. La dedup del
    // dashboard usa estos campos — sin ellos, si el candidato se borra
    // (cascade arrastra Activity), las metricas de Interviews de
    // periodos viejos pueden contar de menos por ambiguedad.
    await logActivity({
      action: "interview.scheduled",
      description: `${ctx.userName} scheduled interview "${title}" with ${interview.candidate.firstName} ${interview.candidate.lastName} for ${interview.job.title}`,
      userId: ctx.userId,
      candidateId,
      organizationId: ctx.organizationId,
      metadata: {
        interviewId: interview.id,
        submissionId: submissionId || null,
        jobId,
      },
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
          recruiterEmail: ctx.userEmail || undefined,
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
              recruiterEmail: ctx.userEmail || undefined,
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
