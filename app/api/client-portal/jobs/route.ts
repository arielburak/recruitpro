import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { clientJobAccessWhere } from "@/lib/client-job-access";

export async function GET() {
  try {
    const ctx = await getClientContext();

    const jobs = await prisma.clientJob.findMany({
      // Visibility scope: admins see all, non-admins see jobs they're
      // a member of (plus legacy jobs with no member list). Centralized
      // in clientJobAccessWhere so every list endpoint applies the
      // same rule.
      where: clientJobAccessWhere(ctx),
      include: {
        postedBy: { select: { name: true } },
        engagements: {
          include: {
            organization: { select: { name: true, id: true } },
            invitedUser: { select: { id: true, name: true, email: true } },
          },
        },
        // Email invites sent to people who haven't registered yet. We
        // surface them alongside engagements so the client doesn't lose
        // track of who they've already reached out to.
        pendingFirmInvites: {
          select: { id: true, email: true, message: true, createdAt: true },
        },
        // Visible members for the JO's chip strip on the dashboard /
        // detail page. Empty list = "everyone on the team".
        members: {
          select: {
            clientUser: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        // Chat-style notes thread for the client team (replaces the
        // legacy `notes` string). CLIENT_INTERNAL by definition — the
        // agency side never sees these rows.
        comments: {
          where: { type: "CLIENT_INTERNAL" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            type: true,
            mentions: true,
            createdAt: true,
            clientUserId: true,
            clientUser: { select: { id: true, name: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // For each job, fetch the assigned team members from the recruiter-side Job
    const enriched = await Promise.all(
      jobs.map(async (job) => {
        // Find recruiter-side jobs linked to this client job via engagements
        const engagementJobIds = job.engagements
          .map((e: any) => e.jobId)
          .filter(Boolean) as string[];

        // Also find recruiter-side jobs that match this client + title
        const recruiterJobs = await prisma.job.findMany({
          where: {
            OR: [
              ...(engagementJobIds.length > 0 ? [{ id: { in: engagementJobIds } }] : []),
              { clientId: ctx.clientId, title: job.title },
            ],
          },
          select: {
            id: true,
            assignments: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, role: true },
                },
              },
            },
          },
        });

        // Flatten and deduplicate team members
        const teamMap = new Map<string, any>();
        for (const rj of recruiterJobs) {
          for (const a of rj.assignments) {
            if (!teamMap.has(a.user.id)) {
              teamMap.set(a.user.id, {
                id: a.user.id,
                name: a.user.name,
                email: a.user.email,
                role: a.user.role,
              });
            }
          }
        }

        // Count shared candidates per firm (organization)
        const firmCandidateCounts: Record<string, number> = {};
        for (const eng of job.engagements) {
          if (eng.status === "ACCEPTED") {
            const count = await prisma.candidateSubmission.count({
              where: {
                isSharedWithClient: true,
                job: {
                  clientId: ctx.clientId,
                  organizationId: eng.organization.id,
                },
              },
            });
            firmCandidateCounts[eng.organization.id] = count;
          }
        }

        return {
          ...job,
          teamMembers: Array.from(teamMap.values()),
          firmCandidateCounts,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    const body = await request.json();

    if (!body.title) {
      return NextResponse.json({ error: "Job title is required" }, { status: 400 });
    }

    // Per-JO access: caller can pass an explicit memberIds list (the
    // team members who can see this job). The creator is always
    // included even if omitted from the payload — getting locked out
    // of a job you just posted would be a baffling UX. memberIds is
    // also filtered to only ClientUsers of THIS Client so a malicious
    // caller can't smuggle in IDs from another workspace.
    const rawMemberIds: string[] = Array.isArray(body.memberIds)
      ? body.memberIds.filter((id: unknown): id is string => typeof id === "string")
      : [];
    const validMembers = rawMemberIds.length
      ? await prisma.clientUser.findMany({
          where: { id: { in: rawMemberIds }, clientId: ctx.clientId, isActive: true },
          select: { id: true },
        })
      : [];
    const memberIds = new Set<string>([
      ctx.clientUserId,
      ...validMembers.map((m) => m.id),
    ]);

    const job = await prisma.clientJob.create({
      data: {
        title: body.title,
        description: body.description || null,
        requirements: body.requirements || null,
        location: body.location || null,
        salaryRange: body.salaryRange || null,
        salaryCurrency: body.salaryCurrency || "USD",
        jobType: body.jobType || "Full-time",
        isRemote: body.workMode ? body.workMode !== "ON_SITE" : (body.isRemote || false),
        clientId: ctx.clientId,
        postedById: ctx.clientUserId,
        members: {
          create: Array.from(memberIds).map((cuId) => ({ clientUserId: cuId })),
        },
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
