import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { candidateSchema } from "@/lib/validations/candidate";
import { logActivity } from "@/lib/activity";
import { sendInterviewInviteEmail } from "@/lib/email";
import { addAttendeeToGoogleEvent, getValidAccessToken } from "@/lib/google-calendar";
import { requireAdminResponse } from "@/lib/permissions";

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
            job: {
              select: {
                title: true,
                id: true,
                clientId: true,
                // Fee/terms/currency surface on the candidate page so
                // the Placement dialog can prefill exactly the way the
                // board flow does. Fallback chain at use time: job →
                // client defaults → undefined.
                feeAmount: true,
                feeType: true,
                currency: true,
                paymentTerms: true,
                guaranteePeriod: true,
                client: {
                  select: {
                    name: true,
                    defaultPaymentTerms: true,
                    defaultGuaranteePeriod: true,
                    defaultCurrency: true,
                  },
                },
                // Stages of the job's pipeline so the candidate page can
                // render an inline stage selector for each submission.
                stages: {
                  select: { id: true, name: true, color: true, order: true },
                  orderBy: { order: "asc" },
                },
                // Defense-in-depth for ROADMAP.md #3: include this
                // user's JobAssignment for each submission's job so
                // the candidate page can hide the stage selector +
                // share toggle on jobs the user isn't on. Server still
                // enforces in /api/submissions/[id] (PATCH/DELETE),
                // this just stops the UI from offering a control that
                // would 404.
                assignments: {
                  where: { userId: ctx.userId },
                  select: { userId: true },
                },
              },
            },
            stage: { select: { id: true, name: true, color: true } },
            // Mirror the per-row data the /jobs/[id] List view shows so
            // the candidate's Jobs tab can read like a mini submissions
            // table: share status (+ when), the client's perceived stage
            // when shared, and activity counters.
            clientStage: { select: { id: true, name: true, color: true } },
            _count: { select: { comments: true, ratings: true } },
            // Linked placement (if any). The candidate page warns before
            // leaving Placed because that deletes the placement.
            placement: { select: { id: true } },
            ratings: {
              select: { score: true, feedback: true, clientUser: { select: { name: true } } },
            },
            comments: {
              // Staffing firm can only see INTERNAL + CLIENT_VISIBLE, never CLIENT_INTERNAL
              where: { type: { in: ["INTERNAL", "CLIENT_VISIBLE"] } },
              select: {
                id: true,
                content: true,
                type: true,
                mentions: true,
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
          // Candidate-level comments: still filter CLIENT_INTERNAL out for safety
          where: { type: { in: ["INTERNAL", "CLIENT_VISIBLE"] } },
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
        // Interview history per candidate. The candidate page surfaces
        // this as a dedicated tab so the recruiter can see every
        // session a candidate sat through across jobs, not just the
        // current stage. Ordered chronologically (earliest first) so
        // the timeline reads top-to-bottom in real time order.
        interviews: {
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            type: true,
            status: true,
            notes: true,
            meetingLink: true,
            location: true,
            timezone: true,
            job: { select: { id: true, title: true } },
          },
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

    // Resolve owner the same way the POST does: only honor an
    // ownerId that belongs to this org. A stale dropdown value or
    // a tampered request body can't shove the candidate into a
    // foreign tenant. If the supplied id doesn't match, we keep
    // the existing owner instead of silently downgrading to the
    // current actor.
    //
    // Changing the owner is purely forward-looking: past Placement
    // rows keep their own recruiterId (separate field), so reporting
    // by-recruiter on historical placements stays accurate.
    let resolvedOwnerId: string | undefined = undefined;
    if (data.ownerId) {
      const owner = await prisma.user.findFirst({
        where: { id: data.ownerId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (owner) resolvedOwnerId = owner.id;
    }
    // Strip ownerId before spreading — we handle it explicitly
    // through resolvedOwnerId below so a foreign-org id can't slip
    // into the update via the rest payload.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { ownerId: _ignored, ...updateData } = data;

    const candidate = await prisma.candidate.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...updateData,
        currentSalary: data.currentSalary ?? null,
        desiredSalary: data.desiredSalary ?? null,
        ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}),
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

    // If the email changed, propagate to future interview invites so the
    // candidate doesn't lose the meeting. Preferred path: add the new email
    // as an attendee on the existing Google Calendar event (keeps the same
    // event/Meet link, keeps the old attendee in place). Fallback: re-send
    // the invite email only.
    let gcalUpdatedCount = 0;
    let emailResentCount = 0;
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

      // Cache access tokens per owner so we don't hit the DB N times
      const tokenCache = new Map<string, string | null>();

      for (const iv of upcomingInterviews) {
        let gcalAdded = false;

        // 1) Try to add the new email to the existing Google Calendar event
        if (iv.googleEventId && iv.googleCalendarOwnerId) {
          if (!tokenCache.has(iv.googleCalendarOwnerId)) {
            tokenCache.set(
              iv.googleCalendarOwnerId,
              await getValidAccessToken(iv.googleCalendarOwnerId)
            );
          }
          const accessToken = tokenCache.get(iv.googleCalendarOwnerId);
          if (accessToken) {
            gcalAdded = await addAttendeeToGoogleEvent({
              accessToken,
              eventId: iv.googleEventId,
              newAttendee: {
                email: newEmail,
                displayName: `${data.firstName} ${data.lastName}`,
              },
            });
            if (gcalAdded) gcalUpdatedCount++;
          }
        }

        // 2) If we couldn't update Google Calendar (no event, no token, or
        //    the API call failed), fall back to a fresh invite email so the
        //    candidate still gets notified at the new address.
        if (!gcalAdded) {
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
            emailResentCount++;
          } catch (emailErr) {
            console.error(
              `[candidate.update] Failed to re-send interview invite to ${newEmail}:`,
              emailErr
            );
          }
        }
      }

      const totalPropagated = gcalUpdatedCount + emailResentCount;
      if (totalPropagated > 0) {
        const bits: string[] = [];
        if (gcalUpdatedCount > 0) {
          bits.push(
            `added to ${gcalUpdatedCount} Google Calendar event${gcalUpdatedCount === 1 ? "" : "s"}`
          );
        }
        if (emailResentCount > 0) {
          bits.push(
            `resent ${emailResentCount} invite email${emailResentCount === 1 ? "" : "s"}`
          );
        }
        await logActivity({
          action: "candidate.email_changed",
          description: `${ctx.userName} updated email for ${data.firstName} ${data.lastName} — ${bits.join(", ")} (→ ${newEmail})`,
          userId: ctx.userId,
          candidateId: id,
          organizationId: ctx.organizationId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      gcalUpdated: gcalUpdatedCount,
      resentInvites: emailResentCount,
    });
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    // Opt-out for "keep historical metrics". Default behaviour:
    // candidate delete cascades to Activity (schema FK is ON DELETE
    // CASCADE), wiping their entire history. If the caller wants to
    // preserve dashboard metrics (e.g. "Juan left but his Q1
    // interviews still count toward my performance"), they pass
    // ?keepMetrics=true and we orphan the rows by nulling candidateId
    // BEFORE the delete. Once the FK is null'd, the cascade no longer
    // reaches those rows, and the dashboard fallback (description
    // regex) still credits them to the actor.
    const url = new URL(request.url);
    const keepMetrics = url.searchParams.get("keepMetrics") === "true";

    // Verify ownership before any mutation so we don't half-orphan
    // Activity rows for a candidate that doesn't belong to this org.
    const exists = await prisma.candidate.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (keepMetrics) {
      await prisma.activity.updateMany({
        where: { candidateId: id, organizationId: ctx.organizationId },
        data: { candidateId: null },
      });
    }

    await prisma.candidate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, keptMetrics: keepMetrics });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
