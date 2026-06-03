import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { clientJobAccessWhere } from "@/lib/client-job-access";

export async function GET() {
  try {
    const ctx = await getClientContext();

    const [client, clientJobs, agencyJobs, totalCandidates, engagements] = await Promise.all([
      prisma.client.findUnique({
        where: { id: ctx.clientId },
        // isStub powers the onboarding banner that nudges OAuth /
        // quick-share self-signups to fill in real company info.
        select: { name: true, industry: true, isStub: true },
      }),
      prisma.clientJob.findMany({
        // Per-JO visibility: admins see everything; non-admins see
        // jobs they're a member of (or legacy jobs with no member list).
        //
        // Plus the "shared candidates required" rule: an agency-created
        // mirror ClientJob doesn't appear in the portal until at least
        // one candidate has been shared with this client. The mirror
        // gets minted when the agency first sets up the link, but if
        // no one has been pushed yet there's nothing for the client
        // team to look at — and we don't want the dashboard to look
        // populated when it's empty. Jobs the client posted themselves
        // (createdByAgency=false) bypass this filter — those exist
        // precisely because the client created them and should show
        // up from day one.
        where: {
          AND: [
            clientJobAccessWhere(ctx),
            {
              OR: [
                { createdByAgency: false },
                {
                  engagements: {
                    some: {
                      job: {
                        submissions: { some: { isSharedWithClient: true } },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
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
      // Agency-created Jobs running under this same Client. Same rule:
      // only surface them once at least one candidate has been shared.
      // Without the filter, every Job the recruiter creates under
      // Client X appears immediately in their portal even when nothing
      // is ready to review — the user flagged that as misleading.
      prisma.job.findMany({
        where: {
          clientId: ctx.clientId,
          submissions: { some: { isSharedWithClient: true } },
        },
        select: {
          id: true,
          title: true,
          status: true,
          location: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
          _count: {
            select: {
              submissions: { where: { isSharedWithClient: true } },
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
      // Count UNIQUE accepted firms (one firm on three jobs = 1, not 3).
      // Prior implementation counted FirmEngagement rows, which is what
      // the "Firms Engaged" widget surfaces, and inflated the number.
      prisma.firmEngagement
        .findMany({
          where: { clientJob: { clientId: ctx.clientId }, status: "ACCEPTED" },
          select: { organizationId: true },
          distinct: ["organizationId"],
        })
        .then((rows) => rows.length),
    ]);

    // Dedup the unified Jobs list: if a ClientJob already links to an
    // agency Job via FirmEngagement, the agency Job shouldn't ALSO
    // appear as a separate "agency-managed" row — that's the same
    // logical search showing up twice (once posted by the client,
    // once mirrored on the agency side). The ClientJob is canonical
    // here because the client posted it; the engagement just tells
    // us which agency picked it up.
    const linkedAgencyJobIds = new Set<string>();
    for (const cj of clientJobs) {
      for (const eng of cj.engagements || []) {
        if (eng.jobId) linkedAgencyJobIds.add(eng.jobId);
      }
    }
    const dedupedAgencyJobs = agencyJobs.filter(
      (j) => !linkedAgencyJobIds.has(j.id),
    );

    return NextResponse.json({
      client,
      jobs: clientJobs,
      agencyJobs: dedupedAgencyJobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        location: j.location,
        createdAt: j.createdAt,
        firmName: j.organization?.name || null,
        firmId: j.organization?.id || null,
        candidatesShared: j._count.submissions,
      })),
      stats: {
        openJobs: clientJobs.filter((j) => j.status === "OPEN").length,
        totalCandidates,
        activeRecruiters: engagements,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
