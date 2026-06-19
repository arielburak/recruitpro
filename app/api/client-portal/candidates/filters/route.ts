import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { accessibleAgencyJobIds } from "@/lib/client-job-access";
import { safeErrorMessage } from "@/lib/safe-error";

// Returns filter options for the candidates page:
// - jobs the client has that have at least one shared candidate
// - client pipeline stages (global per client)
// - firms that have shared candidates
export async function GET() {
  try {
    const ctx = await getClientContext();

    // Per-Job membership gate — the dropdowns on the candidates page
    // should only offer jobs / firms the user actually has access to.
    // Without this filter, a ClientUser with no membership on a Job
    // could still see its name in the Job filter dropdown.
    const visibleAgencyJobIds = await accessibleAgencyJobIds(prisma, ctx);

    const [submissions, clientStages] = await Promise.all([
      prisma.candidateSubmission.findMany({
        // Multi-firm: sin job.clientId === ctx.clientId — el gate
        // correcto es jobId IN visibleAgencyJobIds. Ver
        // /api/client-portal/candidates/route.ts para el rationale.
        where: {
          isSharedWithClient: true,
          jobId: visibleAgencyJobIds.length > 0 ? { in: visibleAgencyJobIds } : "__none__",
        },
        select: {
          jobId: true,
          job: {
            select: {
              id: true,
              title: true,
              organization: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.clientPipelineStage.findMany({
        where: { clientId: ctx.clientId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          color: true,
          isTerminal: true,
          kind: true,
        },
      }),
    ]);

    const jobsMap = new Map<string, { id: string; title: string }>();
    const firmsMap = new Map<string, { id: string; name: string }>();

    for (const sub of submissions) {
      jobsMap.set(sub.job.id, { id: sub.job.id, title: sub.job.title });
      firmsMap.set(sub.job.organization.id, { id: sub.job.organization.id, name: sub.job.organization.name });
    }

    return NextResponse.json({
      jobs: Array.from(jobsMap.values()).sort((a, b) => a.title.localeCompare(b.title)),
      firms: Array.from(firmsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      stages: clientStages,
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
