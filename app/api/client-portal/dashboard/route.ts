import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { clientJobAccessWhere } from "@/lib/client-job-access";

export async function GET() {
  try {
    const ctx = await getClientContext();

    const [client, clientJobs, agencyJobs, totalCandidates, engagements] = await Promise.all([
      prisma.client.findUnique({
        where: { id: ctx.clientId },
        select: { name: true, industry: true },
      }),
      prisma.clientJob.findMany({
        // Per-JO visibility: admins see everything; non-admins see
        // jobs they're a member of (or legacy jobs with no member list).
        where: clientJobAccessWhere(ctx),
        include: {
          _count: { select: { engagements: true } },
          engagements: {
            include: {
              organization: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Agency-created Jobs running under this same Client. These never
      // landed in the portal before because the dashboard only listed
      // ClientJob (jobs the hiring company posted themselves). When a
      // recruiter creates a Job in /jobs/new under Client X, the
      // ClientUsers of Client X had no surface to see it on — only the
      // candidates that came out of it via /client-portal/candidates.
      // Surface them as "Active Searches" so the hiring manager knows
      // their recruiter is working on something.
      prisma.job.findMany({
        where: { clientId: ctx.clientId },
        select: {
          id: true,
          title: true,
          status: true,
          location: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
          _count: {
            select: {
              submissions: { where: { isSharedWithClient: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Count candidates shared with this client across all recruiter firms
      prisma.candidateSubmission.count({
        where: {
          isSharedWithClient: true,
          job: { clientId: ctx.clientId },
        },
      }),
      // Count UNIQUE accepted firms (one firm on three jobs = 1, not 3).
      // Prior implementation counted FirmEngagement rows, which is what
      // the "Firms Engaged" widget surfaces, and inflated the number.
      prisma.firmEngagement
        .findMany({
          where: { clientJob: { clientId: ctx.clientId }, status: "ACCEPTED" },
          select: { organizationId: true },
          distinct: ["organizationId"],
        })
        .then((rows) => rows.length),
    ]);

    return NextResponse.json({
      client,
      jobs: clientJobs,
      agencyJobs: agencyJobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        location: j.location,
        createdAt: j.createdAt,
        firmName: j.organization?.name || null,
        firmId: j.organization?.id || null,
        candidatesShared: j._count.submissions,
      })),
      stats: {
        openJobs: clientJobs.filter((j) => j.status === "OPEN").length,
        totalCandidates,
        activeRecruiters: engagements,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
