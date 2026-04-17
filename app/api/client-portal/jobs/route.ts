import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getClientContext();

    const jobs = await prisma.clientJob.findMany({
      where: { clientId: ctx.clientId },
      include: {
        postedBy: { select: { name: true } },
        engagements: {
          include: {
            organization: { select: { name: true, id: true } },
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
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
