import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { candidateSchema } from "@/lib/validations/candidate";
import { logActivity } from "@/lib/activity";
import { sendInterviewInviteEmail } from "@/lib/email";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const candidate = await prisma.candidate.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        owner: { select: { name: true, email: true } },
        documents: true,
        submissions: {
          include: {
            job: { select: { title: true, id: true, clientId: true, client: { select: { name: true } } } },
            stage: { select: { name: true, color: true } },
            ratings: {
              select: { score: true, feedback: true, clientUser: { select: { name: true } } },
            },
            comments: {
              select: {
                id: true,
                content: true,
                type: true,
                createdAt: true,
                userId: true,
                user: { select: { id: true, name: true } },
                clientUser: { select: { id: true, name: true } },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        comments: {
          include: {
            user: { select: { id: true, name: true } },
            clientUser: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { user: { select: { name: true } } },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(candidate);
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
    const data = candidateSchema.parse(body);

    // Snapshot the old candidate so we can detect email changes
    const existing = await prisma.candidate.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const oldEmail = existing.email?.toLowerCase().trim() || "";
    const newEmail = data.email?.toLowerCase().trim() || "";
    const emailChanged = !!newEmail && newEmail !== oldEmail;

    const candidate = await prisma.candidate.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...data,
        currentSalary: data.currentSalary ?? null,
        desiredSalary: data.desiredSalary ?? null,
      },
    });

    if (candidate.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await logActivity({
      action: "candidate.updated",
      description: `${ctx.userName} updated candidate ${data.firstName} ${data.lastName}`,
      userId: ctx.userId,
      candidateId: id,
      organizationId: ctx.organizationId,
    });

    // If the email changed, re-send future interview invites to the new address
    // so scheduled meetings don't get lost in the void.
    let resentCount = 0;
    if (emailChanged) {
      const now = new Date();
      const upcomingInterviews = await prisma.interview.findMany({
        where: {
          candidateId: id,
          organizationId: ctx.organizationId,
          status: "SCHEDULED",
          startTime: { gte: now },
        },
        include: {
          job: { select: { title: true, client: { select: { name: true } } } },
          creator: { select: { name: true } },
        },
      });

      for (const iv of upcomingInterviews) {
        const emailDateOpts = {
          weekday: "long" as const, year: "numeric" as const,
          month: "long" as const, day: "numeric" as const,
          timeZone: iv.timezone,
        };
        const emailTimeOpts = {
          hour: "numeric" as const, minute: "2-digit" as const,
          hour12: true as const, timeZone: iv.timezone,
        };
        const formattedDate = iv.startTime.toLocaleDateString("en-US", emailDateOpts);
        const formattedStart = iv.startTime.toLocaleTimeString("en-US", emailTimeOpts);
        const formattedEnd = iv.endTime.toLocaleTimeString("en-US", emailTimeOpts);

        try {
          await sendInterviewInviteEmail({
            to: newEmail,
            candidateName: data.firstName,
            jobTitle: iv.job.title,
            clientName: iv.job.client?.name || "",
            interviewDate: formattedDate,
            interviewTime: formattedStart,
            interviewEndTime: formattedEnd,
            timezone: iv.timezone,
            interviewType: iv.type,
            meetingLink: iv.meetingLink || undefined,
            location: iv.location || undefined,
            notes: iv.notes || undefined,
            recruiterName: iv.creator?.name || ctx.userName,
          });
          resentCount++;
        } catch (emailErr) {
          console.error(
            `[candidate.update] Failed to re-send interview invite to ${newEmail}:`,
            emailErr
          );
        }
      }

      if (resentCount > 0) {
        await logActivity({
          action: "candidate.email_changed",
          description: `${ctx.userName} updated email for ${data.firstName} ${data.lastName} — resent ${resentCount} upcoming interview invite${resentCount === 1 ? "" : "s"} to ${newEmail}`,
          userId: ctx.userId,
          candidateId: id,
          organizationId: ctx.organizationId,
        });
      }
    }

    return NextResponse.json({ success: true, resentInvites: resentCount });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
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

    const deleted = await prisma.candidate.deleteMany({
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
