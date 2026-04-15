import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// List candidates shared with this client (for interview scheduling)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const search = request.nextUrl.searchParams.get("search") || "";

    const submissions = await prisma.candidateSubmission.findMany({
      where: {
        isSharedWithClient: true,
        job: { clientId: ctx.clientId },
        ...(search.length >= 2
          ? {
              candidate: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" as const } },
                  { lastName: { contains: search, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      },
      select: {
        id: true,
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            currentTitle: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Group by candidate
    const candidateMap = new Map<string, {
      id: string;
      firstName: string;
      lastName: string;
      currentTitle: string | null;
      submissions: { id: string; jobId: string; jobTitle: string }[];
    }>();

    for (const sub of submissions) {
      const c = sub.candidate;
      if (!candidateMap.has(c.id)) {
        candidateMap.set(c.id, {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          currentTitle: c.currentTitle,
          submissions: [],
        });
      }
      candidateMap.get(c.id)!.submissions.push({
        id: sub.id,
        jobId: sub.job.id,
        jobTitle: sub.job.title,
      });
    }

    return NextResponse.json(Array.from(candidateMap.values()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
