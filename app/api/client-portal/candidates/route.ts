import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// List candidates shared with this client
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const search = request.nextUrl.searchParams.get("search") || "";
    const firmId = request.nextUrl.searchParams.get("firmId") || "";

    const where: any = {
      isSharedWithClient: true,
      job: { clientId: ctx.clientId },
    };

    if (search.length >= 2) {
      where.candidate = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
        ],
      };
    }

    if (firmId) {
      where.job.organizationId = firmId;
    }

    const submissions = await prisma.candidateSubmission.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            currentTitle: true,
            currentCompany: true,
            location: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            organization: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Group by candidate
    const candidateMap = new Map<string, {
      id: string;
      firstName: string;
      lastName: string;
      currentTitle: string | null;
      currentCompany: string | null;
      location: string | null;
      submissions: { id: string; jobId: string; jobTitle: string; firmId: string; firmName: string; sharedAt: string }[];
    }>();

    for (const sub of submissions) {
      const c = sub.candidate;
      if (!candidateMap.has(c.id)) {
        candidateMap.set(c.id, {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          currentTitle: c.currentTitle,
          currentCompany: c.currentCompany,
          location: c.location,
          submissions: [],
        });
      }
      candidateMap.get(c.id)!.submissions.push({
        id: sub.id,
        jobId: sub.job.id,
        jobTitle: sub.job.title,
        firmId: sub.job.organization.id,
        firmName: sub.job.organization.name,
        sharedAt: sub.createdAt.toISOString(),
      });
    }

    return NextResponse.json(Array.from(candidateMap.values()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
