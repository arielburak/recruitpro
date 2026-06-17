import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { clientJobAccessWhere } from "@/lib/client-job-access";
import { safeErrorMessage } from "@/lib/safe-error";

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
        // Per-JO visibility: a ClientUser sees the JO only when
        // they're an explicit member (ClientJobMember row). No
        // admin bypass, no "any candidates shared" relaxation —
        // the user flagged that a Job they were assigned to as a
        // recruiter but had not invited any contact for was still
        // showing up. WhatsApp-group rule: invited or nothing.
        where: clientJobAccessWhere(ctx),
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
      // Agency-created Jobs running under this same Client. They
      // only surface here when the ClientUser is a member of the
      // ClientJob mirror (gated through the FirmEngagement → mirror
      // → members chain). Without this filter every Job whose
      // clientId matched leaked into the portal regardless of
      // whether the ClientUser had been invited to it — exactly
      // the bug the user flagged.
      // Multi-firm: sin clientId: ctx.clientId. Cuando 2 agencias
      // trabajan el mismo ClientJob, cada Job creado por ellas tiene
      // su propio Client record (audit metadata, NO authoritative).
      // El gate de membership via firmEngagements.clientJob.members
      // ya hace el trabajo correcto.
      prisma.job.findMany({
        where: {
          firmEngagements: {
            some: {
              status: "ACCEPTED",
              clientJob: {
                members: { some: { clientUserId: ctx.clientUserId } },
              },
            },
          },
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
      // Count candidates shared with this client across all recruiter
      // firms. Multi-firm: el gate correcto es el firmEngagement chain
      // (job.firmEngagements ACCEPTED.clientJob.clientId === ctx.clientId)
      // en vez de job.clientId, ya que cada agencia tiene su propio
      // Client record para el mismo cliente real.
      prisma.candidateSubmission.count({
        where: {
          isSharedWithClient: true,
          job: {
            firmEngagements: {
              some: {
                status: "ACCEPTED",
                clientJob: { clientId: ctx.clientId },
              },
            },
          },
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
