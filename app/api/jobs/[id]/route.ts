import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { jobSchema } from "@/lib/validations/job";
import { notifyClientOfJobStatusChange } from "@/lib/job-status-notifications";

// A job is "private" when it was born from a person-level client-portal
// invite: at least one FirmEngagement row points at it with invitedUserId
// set. Private jobs are visible only to their assignees, even to firm
// admins. Legacy or directly-created jobs (no such engagements) keep
// the old behaviour — admins see everything, non-admins need an
// assignment.
async function canAccessJob(
  jobId: string,
  organizationId: string,
  userId: string,
  role: "ADMIN" | "USER"
): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      assignments: { where: { userId }, select: { userId: true } },
      firmEngagements: {
        where: { invitedUserId: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!job) return false;
  const isAssigned = job.assignments.length > 0;
  const isPrivate = job.firmEngagements.length > 0;
  if (isPrivate) return isAssigned;
  return role === "ADMIN" || isAssigned;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    let job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        client: true,
        stages: { orderBy: { order: "asc" } },
        assignments: { include: { user: { select: { id: true, name: true } } } },
        documents: { orderBy: { createdAt: "desc" } },
        firmEngagements: {
          where: { invitedUserId: { not: null } },
          select: { id: true },
          take: 1,
        },
        submissions: {
          include: {
            candidate: {
              select: {
                id: true, firstName: true, lastName: true,
                currentTitle: true, currentCompany: true, location: true,
                desiredSalary: true, salaryCurrency: true,
              },
            },
            stage: true,
            clientStage: {
              select: { id: true, name: true, color: true, order: true },
            },
            placement: { select: { id: true } },
            _count: { select: { comments: true, ratings: true } },
          },
        },
        // Interviews for this job, chronological. The job page surfaces
        // them in a dedicated tab so the recruiter can see the
        // pipeline-to-meeting timeline in one place.
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
            submissionId: true,
            candidate: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    // If not found, check if the ID is a ClientJob ID with an engagement for this firm
    if (!job) {
      const engagement = await prisma.firmEngagement.findFirst({
        where: { clientJobId: id, organizationId: ctx.organizationId },
        select: { id: true, status: true, jobId: true },
      });

      if (engagement) {
        if (engagement.status === "ACCEPTED" && engagement.jobId) {
          return NextResponse.json(
            { redirect: `/jobs/${engagement.jobId}` },
            { status: 307 }
          );
        }
        if (engagement.status === "PENDING") {
          return NextResponse.json(
            { error: "pending_engagement", engagementId: engagement.id },
            { status: 404 }
          );
        }
      }

      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isAssigned = job.assignments.some((a: any) => a.user.id === ctx.userId);
    const isPrivate = job.firmEngagements.length > 0;
    if (isPrivate) {
      if (!isAssigned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else if (ctx.role !== "ADMIN" && !isAssigned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Strip the privacy marker we only loaded to make the decision — the
    // client doesn't need that noise.
    const { firmEngagements: _drop, ...jobForClient } = job as any;
    return NextResponse.json(jobForClient);
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
    const data = jobSchema.parse(body);

    const allowed = await canAccessJob(id, ctx.organizationId, ctx.userId, ctx.role);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.job.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: { ...data, feeAmount: data.feeAmount ?? null },
    });

    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
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

    const allowed = await canAccessJob(id, ctx.organizationId, ctx.userId, ctx.role);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.job.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Partial update path for inline edits that only touch a single field
// (the global /jobs list uses this to change a job's status from the
// row dropdown without sending the full form payload). PUT continues
// to be the full-form save path used by the job-edit UI.
// Statuses the PATCH endpoint will accept for inline edits. CLOSED is
// intentionally absent — it's a legacy value kept in the DB enum only
// so existing rows render; new saves can't write it. Recruiters
// migrate any leftover CLOSED rows by flipping them to one of these
// six via the inline dropdown.
const ALLOWED_STATUSES = new Set([
  "OPEN",
  "ACTIVE",
  "ON_HOLD",
  "FILLED",
  "CANCELLED",
  "LOST",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const body = await request.json();

    const allowed = await canAccessJob(id, ctx.organizationId, ctx.userId, ctx.role);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    if (typeof body.status === "string") {
      if (!ALLOWED_STATUSES.has(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status;
    }
    // Inline notes edit. Accepts an empty string to clear the field,
    // null to clear it explicitly, or a string to set it. Capped at
    // 10000 chars defensively so a malicious paste can't bloat the row.
    if (body.notes !== undefined) {
      if (body.notes === null || body.notes === "") {
        data.notes = null;
      } else if (typeof body.notes === "string") {
        data.notes = body.notes.slice(0, 10_000);
      } else {
        return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.job.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data,
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Best-effort client-portal notification on the transitions the
    // hiring contact actually cares about. Wrapped in try/catch so a
    // notification glitch never breaks the status flip itself.
    if (typeof data.status === "string") {
      try {
        await notifyClientOfJobStatusChange({
          jobId: id,
          newStatus: data.status,
          organizationId: ctx.organizationId,
        });
      } catch (e) {
        console.error("[job PATCH] client notif failed:", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
