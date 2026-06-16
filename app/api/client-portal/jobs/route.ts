import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { clientJobAccessWhere } from "@/lib/client-job-access";

export async function GET() {
  try {
    const ctx = await getClientContext();

    const jobs = await prisma.clientJob.findMany({
      // Visibility scope: a ClientUser sees the JO only when they
      // were explicitly invited to it (ClientJobMember row). No
      // admin bypass, no "shared candidates" relaxation — the
      // agency can create hundreds of jobs tagged to this client
      // and none of them surface here until the recruiter actively
      // invites this contact's email to a specific search.
      where: clientJobAccessWhere(ctx),
      include: {
        postedBy: { select: { name: true } },
        engagements: {
          include: {
            organization: { select: { name: true, id: true } },
            // organizationId on the User itself is the live "where do
            // they actually work today" signal — the engagement's
            // organizationId is whatever firm they were AT when the
            // invite was extended. We expose both so the client UI
            // can hide stale rows where the recruiter has since moved
            // (or where invitedUserId is null entirely — orphaned
            // invites that never resolved to a real agency contact).
            // isActive feed el filter del cliente: cuando un User se
            // soft-deactiva (scramble del mail + isActive=false), la
            // row de engagement queda apuntando al user inactivo. La
            // UI filtra esos como si no existieran para no mostrar
            // 'released+<id>@deleted.local' en el panel de firms.
            invitedUser: { select: { id: true, name: true, email: true, organizationId: true, isActive: true } },
          },
        },
        // Email invites sent to people who haven't registered yet. We
        // surface them alongside engagements so the client doesn't lose
        // track of who they've already reached out to.
        pendingFirmInvites: {
          select: { id: true, email: true, message: true, createdAt: true },
        },
        // Visible members for the JO's chip strip on the dashboard /
        // detail page. Empty list = "everyone on the team". passwordHash
        // + emailVerifiedAt come along so the UI can mark members who
        // were invited but never activated as "pending" — gives the
        // client a clear cancel affordance on the panel where they
        // originally hit Invite.
        members: {
          select: {
            clientUser: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                passwordHash: true,
                emailVerifiedAt: true,
              },
            },
          },
        },
        // Chat-style notes thread for the ClientJob. Two tabs in the
        // UI:
        //   · CLIENT_INTERNAL → only the client team sees the row;
        //     the agency is never notified.
        //   · CLIENT_VISIBLE  → shared with the agency, who can
        //     read and reply from /jobs/[id] Notes on their side.
        // Author info comes via clientUser (when the client posted)
        // OR user (when staffing did) so the chat can render the
        // right name and avatar.
        comments: {
          where: { type: { in: ["CLIENT_INTERNAL", "CLIENT_VISIBLE"] } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            type: true,
            mentions: true,
            createdAt: true,
            clientUserId: true,
            clientUser: { select: { id: true, name: true, title: true } },
            userId: true,
            user: { select: { id: true, name: true } },
            // jobId points at the agency-side Job for CLIENT_VISIBLE
            // rows (CLIENT_INTERNAL is null). The client portal uses
            // it to group "Shared with [agency]" threads by engagement
            // — one tab per accepted firm.
            jobId: true,
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

        // Strip passwordHash before shipping — the UI only needs the
        // derived "isPending" boolean (member exists but never
        // activated: no password set + email never verified). The
        // hash itself stays server-side.
        const sanitizedMembers = (job.members || []).map((m: any) => ({
          clientUser: {
            id: m.clientUser.id,
            name: m.clientUser.name,
            email: m.clientUser.email,
            role: m.clientUser.role,
            isPending:
              !m.clientUser.passwordHash && !m.clientUser.emailVerifiedAt,
          },
        }));

        return {
          ...job,
          members: sanitizedMembers,
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
