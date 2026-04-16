import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// List candidates shared with this client
//
// Two modes:
// - Default (grouped): one entry per candidate with submissions[] — used by calendar picker
// - flat=true: one entry per submission with stage info — used by candidates list page
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const params = request.nextUrl.searchParams;
    const search = params.get("search") || "";
    const firmId = params.get("firmId") || "";
    const jobId = params.get("jobId") || "";
    const stageId = params.get("stageId") || "";
    const flat = params.get("flat") === "true";

    const where: any = {
      isSharedWithClient: true,
      job: { clientId: ctx.clientId },
    };

    if (search.length >= 2) {
      where.candidate = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { currentTitle: { contains: search, mode: "insensitive" as const } },
          { currentCompany: { contains: search, mode: "insensitive" as const } },
        ],
      };
    }

    if (jobId) where.jobId = jobId;
    if (stageId) where.stageId = stageId;
    if (firmId) where.job.organizationId = firmId;

    const submissions = await prisma.candidateSubmission.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
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
        stage: {
          select: { id: true, name: true, order: true, color: true },
        },
        submitter: {
          select: { id: true, name: true },
        },
        ratings: {
          select: { clientUserId: true, score: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: flat ? 200 : 50,
    });

    if (flat) {
      // Flat-by-submission: one row per submission with stage + rating info
      const result = submissions.map((sub) => {
        const myRating = sub.ratings.find((r) => r.clientUserId === ctx.clientUserId);
        const scores = sub.ratings.map((r) => r.score).filter((s): s is number => typeof s === "number" && s > 0);
        const avgRating = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        return {
          submissionId: sub.id,
          candidate: {
            id: sub.candidate.id,
            firstName: sub.candidate.firstName,
            lastName: sub.candidate.lastName,
            currentTitle: sub.candidate.currentTitle,
            currentCompany: sub.candidate.currentCompany,
            location: sub.candidate.location,
          },
          job: {
            id: sub.job.id,
            title: sub.job.title,
          },
          firm: {
            id: sub.job.organization.id,
            name: sub.job.organization.name,
          },
          stage: sub.stage
            ? {
                id: sub.stage.id,
                name: sub.stage.name,
                order: sub.stage.order,
                color: sub.stage.color,
              }
            : null,
          sharedBy: sub.submitter?.name || null,
          sharedAt: sub.createdAt.toISOString(),
          updatedAt: sub.updatedAt.toISOString(),
          myRating: myRating?.score ?? null,
          avgRating,
          ratingCount: scores.length,
        };
      });
      return NextResponse.json(result);
    }

    // Grouped by candidate (backward compat for calendar picker)
    const candidateMap = new Map<
      string,
      {
        id: string;
        firstName: string;
        lastName: string;
        currentTitle: string | null;
        currentCompany: string | null;
        location: string | null;
        submissions: { id: string; jobId: string; jobTitle: string; firmId: string; firmName: string; sharedAt: string }[];
      }
    >();

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
