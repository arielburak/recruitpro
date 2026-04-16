import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Returns filter options for the candidates page:
// - jobs the client has that have at least one shared candidate
// - stages (per job) available to filter by
// - firms that have shared candidates
export async function GET() {
  try {
    const ctx = await getClientContext();

    const submissions = await prisma.candidateSubmission.findMany({
      where: {
        isSharedWithClient: true,
        job: { clientId: ctx.clientId },
      },
      select: {
        jobId: true,
        stageId: true,
        job: {
          select: {
            id: true,
            title: true,
            organization: { select: { id: true, name: true } },
          },
        },
        stage: {
          select: { id: true, name: true, order: true, color: true, jobId: true },
        },
      },
    });

    // Dedupe jobs
    const jobsMap = new Map<string, { id: string; title: string }>();
    const firmsMap = new Map<string, { id: string; name: string }>();
    const stagesByJob = new Map<string, { id: string; name: string; order: number; color: string }[]>();
    const stageSeen = new Set<string>();

    for (const sub of submissions) {
      jobsMap.set(sub.job.id, { id: sub.job.id, title: sub.job.title });
      firmsMap.set(sub.job.organization.id, { id: sub.job.organization.id, name: sub.job.organization.name });

      if (sub.stage) {
        const key = `${sub.stage.jobId}::${sub.stage.id}`;
        if (!stageSeen.has(key)) {
          stageSeen.add(key);
          const arr = stagesByJob.get(sub.stage.jobId) || [];
          arr.push({
            id: sub.stage.id,
            name: sub.stage.name,
            order: sub.stage.order,
            color: sub.stage.color,
          });
          stagesByJob.set(sub.stage.jobId, arr);
        }
      }
    }

    // Sort stages by order within each job
    for (const [, arr] of stagesByJob) {
      arr.sort((a, b) => a.order - b.order);
    }

    return NextResponse.json({
      jobs: Array.from(jobsMap.values()).sort((a, b) => a.title.localeCompare(b.title)),
      firms: Array.from(firmsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      stagesByJob: Object.fromEntries(stagesByJob),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
