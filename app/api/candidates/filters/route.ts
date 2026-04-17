import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getOrgContext();
    const orgFilter = { organizationId: ctx.organizationId };

    // Run all queries in parallel
    const [owners, locations, jobsWithClients] = await Promise.all([
      // Unique owners who have candidates
      prisma.user.findMany({
        where: {
          organizationId: ctx.organizationId,
          candidates: { some: orgFilter },
        },
        select: { id: true, name: true, _count: { select: { candidates: true } } },
        orderBy: { name: "asc" },
      }),

      // Unique locations (raw query for distinct non-null)
      prisma.candidate.findMany({
        where: { ...orgFilter, location: { not: null } },
        select: { location: true },
        distinct: ["location"],
        orderBy: { location: "asc" },
      }),

      // Jobs that have submissions (for job + client filters)
      prisma.job.findMany({
        where: {
          organizationId: ctx.organizationId,
          submissions: { some: {} },
        },
        select: {
          id: true,
          title: true,
          client: { select: { id: true, name: true } },
          _count: { select: { submissions: true } },
        },
        orderBy: { title: "asc" },
      }),
    ]);

    // Count candidates per location
    const locationCounts = new Map<string, number>();
    const allCandidatesWithLocation = await prisma.candidate.groupBy({
      by: ["location"],
      where: { ...orgFilter, location: { not: null } },
      _count: true,
    });
    for (const loc of allCandidatesWithLocation) {
      if (loc.location) locationCounts.set(loc.location, loc._count);
    }

    // Build client list from jobs (deduplicate)
    const clientMap = new Map<string, { name: string; count: number }>();
    for (const j of jobsWithClients) {
      if (j.client) {
        const existing = clientMap.get(j.client.id);
        if (existing) {
          existing.count += j._count.submissions;
        } else {
          clientMap.set(j.client.id, { name: j.client.name, count: j._count.submissions });
        }
      }
    }

    return NextResponse.json({
      owners: owners.map((o) => ({
        value: o.id,
        label: o.name,
        count: o._count.candidates,
      })),
      locations: locations
        .filter((l) => l.location)
        .map((l) => ({
          value: l.location!,
          label: l.location!,
          count: locationCounts.get(l.location!) || 0,
        })),
      jobs: jobsWithClients.map((j) => ({
        value: j.id,
        label: j.title,
        count: j._count.submissions,
      })),
      clients: Array.from(clientMap.entries())
        .map(([id, data]) => ({
          value: id,
          label: data.name,
          count: data.count,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
