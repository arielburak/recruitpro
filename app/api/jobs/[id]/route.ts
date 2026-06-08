import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { jobSchema } from "@/lib/validations/job";
import { notifyClientOfJobStatusChange } from "@/lib/job-status-notifications";

// Job visibility is strictly assignment-based: everyone — admins
// included — needs an explicit JobAssignment row to see / mutate the
// job. The `role` argument stays in the signature so callers don't
// have to rewire, but it no longer grants a bypass. Public/private
// distinction is irrelevant here; the GET handler still loads
// firmEngagements separately for the legacy mention/engagement
// fallback grants below.
async function canAccessJob(
  jobId: string,
  organizationId: string,
  userId: string,
  _role: "ADMIN" | "USER"
): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      assignments: { where: { userId }, select: { userId: true } },
    },
  });
  if (!job) return false;
  return job.assignments.length > 0;
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
        client: {
          include: {
            // ClientUsers activos del cliente para resolver el caso
            // legacy: si el ClientJob mirror existe pero no tiene
            // members explicitos, todos los ClientUsers activos
            // tienen acceso. Los devolvemos siempre asi el UI puede
            // decidir si mostrar la lista de members o la fallback.
            clientUsers: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                email: true,
                title: true,
                role: true,
              },
              orderBy: { name: "asc" },
            },
          },
        },
        stages: { orderBy: { order: "asc" } },
        assignments: { include: { user: { select: { id: true, name: true } } } },
        // ClientJob mirror (creado cuando la agencia comparte el job
        // con el cliente). Lo incluimos solo para listar los client
        // users con acceso desde la vista de agencia. Si la JO tiene
        // members explicitos, solo esos ven el job; si esta vacio,
        // todos los ClientUsers activos del cliente lo ven (legacy
        // backwards-compat). Esa segunda regla la resolvemos en el
        // page abajo cuando renderea.
        clientJobMirror: {
          select: {
            id: true,
            postedBy: {
              select: { id: true, name: true, email: true, title: true, role: true, isActive: true },
            },
            members: {
              select: {
                clientUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    title: true,
                    role: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
        documents: { orderBy: { createdAt: "desc" } },
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
        // Job-level notes (Notes tab on /jobs/[id]). Same chat pattern
        // as candidate notes — Comment rows scoped via jobId, with the
        // INTERNAL / CLIENT_VISIBLE filter applied so we never leak a
        // CLIENT_INTERNAL row to the firm side.
        comments: {
          where: { type: { in: ["INTERNAL", "CLIENT_VISIBLE"] } },
          include: {
            user: { select: { id: true, name: true } },
            clientUser: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
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

    // Fallback access paths for when assignment alone would 404. Both
    // consulted only on the deny path so the happy path stays one
    // query.
    //
    //   1. Mention-based: if the recruiter was arrobado in any
    //      comment on this job, let them read it. Otherwise the
    //      "X mentioned you in Y" notification lands on a 404 and
    //      the click — which is the whole point of the notification
    //      — does nothing.
    //
    //   2. Engagement-based: a recruiter who accepted a person-
    //      level invite via /engagements should always be able to
    //      open the job from that page, even on rare cases where
    //      the JobAssignment row wasn't created (e.g. legacy
    //      engagements predating the upsert in
    //      /api/engagements/[id]). Without this the link from
    //      /engagements/[clientId] dead-ends in 404.
    let mentioned = false;
    let engaged = false;
    if (!isAssigned) {
      const [m, e] = await Promise.all([
        prisma.comment.findFirst({
          where: { jobId: id, mentions: { has: ctx.userId } },
          select: { id: true },
        }),
        prisma.firmEngagement.findFirst({
          where: { jobId: id, invitedUserId: ctx.userId, status: "ACCEPTED" },
          select: { id: true },
        }),
      ]);
      mentioned = !!m;
      engaged = !!e;
    }

    const hasAccess = isAssigned || mentioned || engaged;
    if (!hasAccess) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(job);
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
