import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getClientContext();

    const [client, jobs, totalCandidates, engagements] = await Promise.all([
      prisma.client.findUnique({
        where: { id: ctx.clientId },
        select: { name: true, industry: true },
      }),
      prisma.clientJob.findMany({
        where: { clientId: ctx.clientId },
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
      // Count candidates shared with this client across all recruiter firms
      prisma.candidateSubmission.count({
        where: {
          isSharedWithClient: true,
          job: { clientId: ctx.clientId },
        },
      }),
      prisma.firmEngagement.count({
        where: {
          clientJob: { clientId: ctx.clientId },
          status: "ACCEPTED",
        },
      }),
    ]);

    return NextResponse.json({
      client,
      jobs,
      stats: {
        openJobs: jobs.filter((j) => j.status === "OPEN").length,
        totalCandidates,
        activeRecruiters: engagements,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
