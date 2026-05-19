import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Returns the unique list of recruiting firms (Organizations) that
// have at least one ACCEPTED engagement with this client, plus the
// per-firm counts surfaced in the dashboard drawer:
//   - jobsCount       — distinct ClientJobs the firm is engaged on
//   - candidatesShared — CandidateSubmissions the firm shared (isSharedWithClient=true)
//   - pendingCount    — engagements still PENDING (response pending)
export async function GET() {
  try {
    const ctx = await getClientContext();

    const [engagements, sharedSubs] = await Promise.all([
      prisma.firmEngagement.findMany({
        where: { clientJob: { clientId: ctx.clientId } },
        select: {
          organizationId: true,
          clientJobId: true,
          status: true,
          organization: { select: { name: true } },
        },
      }),
      prisma.candidateSubmission.findMany({
        where: {
          isSharedWithClient: true,
          job: { clientId: ctx.clientId },
        },
        select: { job: { select: { organizationId: true } } },
      }),
    ]);

    type FirmAgg = {
      organizationId: string;
      name: string;
      jobIds: Set<string>;
      pendingCount: number;
      candidatesShared: number;
    };

    const byOrg = new Map<string, FirmAgg>();
    for (const e of engagements) {
      let agg = byOrg.get(e.organizationId);
      if (!agg) {
        agg = {
          organizationId: e.organizationId,
          name: e.organization.name,
          jobIds: new Set(),
          pendingCount: 0,
          candidatesShared: 0,
        };
        byOrg.set(e.organizationId, agg);
      }
      if (e.status === "ACCEPTED") agg.jobIds.add(e.clientJobId);
      if (e.status === "PENDING") agg.pendingCount += 1;
    }

    for (const s of sharedSubs) {
      const agg = byOrg.get(s.job.organizationId);
      if (agg) agg.candidatesShared += 1;
    }

    const firms = Array.from(byOrg.values())
      // Only surface firms with at least one accepted engagement —
      // pure-pending firms haven't actually started working.
      .filter((f) => f.jobIds.size > 0)
      .map((f) => ({
        organizationId: f.organizationId,
        name: f.name,
        jobsCount: f.jobIds.size,
        pendingCount: f.pendingCount,
        candidatesShared: f.candidatesShared,
      }))
      .sort(
        (a, b) =>
          b.candidatesShared - a.candidatesShared ||
          b.jobsCount - a.jobsCount ||
          a.name.localeCompare(b.name)
      );

    return NextResponse.json({ firms });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
