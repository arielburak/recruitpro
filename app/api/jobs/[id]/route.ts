import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { jobSchema } from "@/lib/validations/job";

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
              },
            },
            stage: true,
            clientStage: {
              select: { id: true, name: true, color: true, order: true },
            },
            _count: { select: { comments: true, ratings: true } },
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
