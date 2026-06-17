import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

// Pipeline stage distribution for the dashboard widget. Counts
// submissions that had any activity in the picked period (`updatedAt`
// in [from, to]) bucketed by the stage they currently sit in.
//
// Interpretation: "What did the team's pipeline look like over this
// period?" A candidate created Jan 5 and moved to Interviewing on
// Jan 20 counts under Interviewing for January. A candidate moved
// to Placed in March is no longer counted in February.
//
// We deliberately use `updatedAt` (not `createdAt`) because that's
// what answers "the candidates I sent and that progressed through
// the funnel in this window" — the question the user asked when
// they wanted a time filter on this chart.

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const sp = request.nextUrl.searchParams;

    const now = new Date();
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : now;

    // Pull the union of submissions with activity in window AND their
    // current stage in one round-trip. We only need name + ordering
    // info so the chart can render the canonical pipeline order.
    const submissions = await prisma.candidateSubmission.findMany({
      where: {
        updatedAt: { gte: from, lte: to },
        job: { organizationId: ctx.organizationId },
      },
      select: {
        stage: { select: { name: true, order: true } },
      },
    });

    // Bucket by stage name + carry the lowest `order` seen so the
    // returned array sorts in the canonical pipeline direction even
    // when a tenant's PipelineStage rows have slightly different
    // order numbers per job.
    const byStage = new Map<string, { count: number; order: number }>();
    for (const s of submissions) {
      const name = s.stage?.name;
      if (!name) continue;
      const order = s.stage?.order ?? 999;
      const curr = byStage.get(name);
      if (curr) {
        curr.count += 1;
        if (order < curr.order) curr.order = order;
      } else {
        byStage.set(name, { count: 1, order });
      }
    }

    const data = Array.from(byStage.entries())
      .map(([name, v]) => ({ name, count: v.count, order: v.order }))
      .sort((a, b) => a.order - b.order)
      .map(({ name, count }) => ({ name, count }));

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      data,
      total: submissions.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
