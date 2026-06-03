import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Search team + client contacts for @-mention autocomplete and other
// pickers (placement dialog, interview attendees, candidate owner).
//
// Job context is optional but important: when callers pass a jobId
// (or submissionId, which resolves to a jobId), the mentionable set
// is narrowed to (a) people with access to the job and (b) client
// contacts that belong to the job's client. Without the context we
// fall back to the org-wide list — that path is what pickers like
// placement/calendar use and they shouldn't be scoped.
export async function GET(request: Request) {
  try {
    const ctx = await getOrgContext();
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const includeClients = url.searchParams.get("includeClients") === "true";
    const jobIdParam = url.searchParams.get("jobId");
    const submissionIdParam = url.searchParams.get("submissionId");

    // Resolve a jobId. We use it for two things downstream: scoping
    // the User list to people with access, and scoping the
    // ClientUser list to the job's client. If the lookup fails
    // (deleted job, wrong org), we don't 4xx — we just fall back to
    // the org-wide path. Caller doesn't lose autocomplete.
    let scopedJob:
      | {
          id: string;
          clientId: string | null;
          assigneeIds: string[];
          invitedUserIds: string[];
          clientJobIds: string[];
        }
      | null = null;
    let jobId = jobIdParam;
    if (!jobId && submissionIdParam) {
      const sub = await prisma.candidateSubmission.findFirst({
        where: { id: submissionIdParam, job: { organizationId: ctx.organizationId } },
        select: { jobId: true },
      });
      jobId = sub?.jobId ?? null;
    }
    if (jobId) {
      const job = await prisma.job.findFirst({
        where: { id: jobId, organizationId: ctx.organizationId },
        select: {
          id: true,
          clientId: true,
          assignments: { select: { userId: true } },
          firmEngagements: {
            where: { invitedUserId: { not: null } },
            select: { invitedUserId: true },
          },
        },
      });
      if (job) {
        // ClientJobs linked to this Job via accepted engagements.
        // Needed so the @-mention picker can restrict client
        // contacts to those who are actually members of the ClientJob
        // (WhatsApp-group rule: you can only @ someone who's in the
        // room). One Job can have multiple linked ClientJobs in
        // legacy flows; we collect them all.
        const engagements = await prisma.firmEngagement.findMany({
          where: { jobId: job.id, status: "ACCEPTED" },
          select: { clientJobId: true },
        });
        scopedJob = {
          id: job.id,
          clientId: job.clientId,
          assigneeIds: job.assignments.map((a) => a.userId),
          invitedUserIds: job.firmEngagements
            .map((e) => e.invitedUserId)
            .filter((v): v is string => !!v),
          clientJobIds: engagements.map((e) => e.clientJobId),
        };
      }
    }

    // Team members. Scoped path: the picker should only show
    // people who can actually open the job (mirrors canAccessJob in
    // /api/jobs/[id]). Private jobs limit to assignees + invited
    // recruiters; non-private jobs add admins on top because they
    // can see every non-private job in the org.
    const userWhere: Prisma.UserWhereInput = {
      organizationId: ctx.organizationId,
      isActive: true,
      name: { contains: q, mode: "insensitive" },
    };
    if (scopedJob) {
      const isPrivate = scopedJob.invitedUserIds.length > 0;
      const allowedIds = Array.from(
        new Set<string>([...scopedJob.assigneeIds, ...scopedJob.invitedUserIds]),
      );
      if (isPrivate) {
        userWhere.id = { in: allowedIds };
      } else {
        userWhere.OR = [{ role: "ADMIN" }, { id: { in: allowedIds } }];
      }
    }

    const users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: q ? 25 : 200,
    });

    type ClientUserHit = {
      id: string;
      name: string;
      email: string;
      client: { name: string } | null;
    };
    let clients: ClientUserHit[] = [];
    if (includeClients) {
      // Scoped path: only ClientUsers who are MEMBERS of the
      // ClientJob backing this Job. WhatsApp-group rule: you can
      // only @-mention someone who's been invited to the room.
      // A client admin / CEO who never got added to this specific
      // search does NOT appear in the picker.
      //
      // When no job context is provided we fall back to the
      // engaged-clients pool — used by callers like the placement
      // dialog that need an org-wide pick.
      const clientWhere: Prisma.ClientUserWhereInput = {
        name: { contains: q, mode: "insensitive" },
        isActive: true,
      };
      if (scopedJob) {
        if (scopedJob.clientJobIds.length === 0) {
          // Job has no accepted engagements / linked ClientJob yet,
          // so there's no member list to source from. Return no
          // clients rather than leak the full roster.
          clients = [];
        } else {
          clientWhere.jobMemberships = {
            some: { clientJobId: { in: scopedJob.clientJobIds } },
          };
          clients = await prisma.clientUser.findMany({
            where: clientWhere,
            select: { id: true, name: true, email: true, client: { select: { name: true } } },
            take: 10,
          });
        }
      } else {
        // Org-wide fallback (no job context). Keep the original
        // engagement filter so we don't return clients we never
        // worked with.
        clientWhere.client = {
          engagedOrganizations: { some: { organizationId: ctx.organizationId } },
        };
        clients = await prisma.clientUser.findMany({
          where: clientWhere,
          select: { id: true, name: true, email: true, client: { select: { name: true } } },
          take: 10,
        });
      }
    }

    return NextResponse.json({
      users: users.map((u) => ({ ...u, type: "user" })),
      clients: clients.map((c) => ({
        ...c,
        type: "client",
        companyName: c.client?.name ?? null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
