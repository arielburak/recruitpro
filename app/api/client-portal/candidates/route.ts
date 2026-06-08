import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { accessibleAgencyJobIds } from "@/lib/client-job-access";

// List candidates shared with this client
//
// Two modes:
// - Default (grouped): one entry per candidate with submissions[] — used by calendar picker
// - flat=true: one entry per submission with clientStage info — used by candidates list page
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const params = request.nextUrl.searchParams;
    const search = params.get("search") || "";
    const firmId = params.get("firmId") || "";
    const jobId = params.get("jobId") || "";
    // The portal job-detail page hits us with a ClientJob.id, not a firm-side
    // Job.id. Resolve it to the underlying firm-Job.ids via FirmEngagement so
    // the candidates that recruiters shared actually surface in the job tab.
    const clientJobId = params.get("clientJobId") || "";
    const clientStageId = params.get("clientStageId") || params.get("stageId") || "";
    const flat = params.get("flat") === "true";

    // Per-Job membership gate: a ClientUser only sees submissions for
    // ClientJobs they're a member of (or legacy-open jobs with no
    // member list). Pre-compute the set of agency Job IDs allowed
    // by visibility, then intersect with whatever the caller is
    // filtering by (raw `jobId` or `clientJobId` query params).
    const visibleAgencyJobIds = await accessibleAgencyJobIds(prisma, ctx);
    const visibleSet = new Set(visibleAgencyJobIds);

    // Start with the visible set; narrow via `jobId` / `clientJobId`
    // if the caller provided them. Returns "__none__" sentinel when
    // the intersection is empty so Prisma returns nothing.
    let allowedJobIds: string[] = visibleAgencyJobIds;

    if (jobId) {
      allowedJobIds = visibleSet.has(jobId) ? [jobId] : [];
    }

    if (clientJobId) {
      const linkedJobs = await prisma.firmEngagement.findMany({
        where: { clientJobId, jobId: { not: null }, clientJob: { clientId: ctx.clientId } },
        select: { jobId: true },
      });
      const requested = linkedJobs
        .map((e: { jobId: string | null }) => e.jobId)
        .filter((v: string | null): v is string => !!v);
      allowedJobIds = requested.filter((jid: string) => visibleSet.has(jid));
    }

    // No filtramos por job.clientId aca aposta. Cada agencia tiene su
    // propio Client record (ver Client.organizationId — audit metadata
    // que NO es authoritative), asi que cuando 2 agencias trabajan el
    // mismo ClientJob, sus Jobs apuntan a Client records DISTINTOS.
    // El ctx.clientId del ClientUser linkea al record de UNA agencia
    // (la que originalmente invito al cliente al portal), asi que
    // filtrar por job.clientId === ctx.clientId borraba todos los
    // submissions de la segunda agencia.
    //
    // El gate correcto ya esta en allowedJobIds (via
    // accessibleAgencyJobIds → ACCEPTED FirmEngagements de los
    // ClientJobs accesibles). Eso garantiza que solo vemos submissions
    // de Jobs efectivamente engaged con este cliente.
    const where: any = {
      isSharedWithClient: true,
      jobId: allowedJobIds.length > 0 ? { in: allowedJobIds } : "__none__",
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
    if (clientStageId) where.clientStageId = clientStageId;
    if (firmId) where.job = { organizationId: firmId };

    const submissions = await prisma.candidateSubmission.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sharedAt: true,
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
        clientStage: {
          select: { id: true, name: true, order: true, color: true, isTerminal: true, kind: true },
        },
        submitter: {
          select: { id: true, name: true },
        },
        ratings: {
          select: { clientUserId: true, score: true },
        },
      },
      orderBy: [{ sharedAt: "desc" }, { createdAt: "desc" }],
      take: flat ? 200 : 50,
    });

    // Map firm-side Job.id → ClientJob.id via FirmEngagement so the candidates
    // list can link to the right ClientJob detail page in the portal. Without
    // this, /client-portal/jobs/<firm-Job-id> 404s and the list crashes when
    // the user clicks the job badge.
    const firmJobIds = Array.from(new Set(submissions.map((s: { job: { id: string } }) => s.job.id)));
    const engagements = firmJobIds.length
      ? await prisma.firmEngagement.findMany({
          where: { jobId: { in: firmJobIds }, clientJob: { clientId: ctx.clientId } },
          select: { jobId: true, clientJobId: true },
        })
      : [];
    const firmJobToClientJob = new Map<string, string>();
    for (const e of engagements) {
      if (e.jobId) firmJobToClientJob.set(e.jobId, e.clientJobId);
    }

    if (flat) {
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
            // Maps the recruiter-side Job to the ClientJob the portal can
            // actually render. Null when the engagement linkage is missing.
            clientJobId: firmJobToClientJob.get(sub.job.id) || null,
          },
          firm: {
            id: sub.job.organization.id,
            name: sub.job.organization.name,
          },
          // Client-facing stage (what the client owns). Fallback to recruiter stage if null.
          stage: sub.clientStage
            ? {
                id: sub.clientStage.id,
                name: sub.clientStage.name,
                order: sub.clientStage.order,
                color: sub.clientStage.color,
              }
            : sub.stage
              ? {
                  id: sub.stage.id,
                  name: sub.stage.name,
                  order: sub.stage.order,
                  color: sub.stage.color,
                }
              : null,
          clientStage: sub.clientStage,
          recruiterStage: sub.stage
            ? { id: sub.stage.id, name: sub.stage.name, color: sub.stage.color }
            : null,
          sharedBy: sub.submitter?.name || null,
          sharedAt: (sub.sharedAt || sub.createdAt).toISOString(),
          updatedAt: sub.updatedAt.toISOString(),
          myRating: myRating?.score ?? null,
          avgRating,
          ratingCount: scores.length,
        };
      });
      return NextResponse.json(result);
    }

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
        sharedAt: (sub.sharedAt || sub.createdAt).toISOString(),
      });
    }

    return NextResponse.json(Array.from(candidateMap.values()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
