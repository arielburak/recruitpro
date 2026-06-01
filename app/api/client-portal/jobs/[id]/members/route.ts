import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";
import { sendClientJobAccessGrantedEmail } from "@/lib/email";

// Manage which ClientUsers can see a given ClientJob.
//
// Auth: the JO's creator (postedBy) or any current member can mutate
// the list — i.e. it's collaborative within the group, no admin
// override. The "admin" role doesn't auto-grant access to JOs (see
// lib/client-job-access for why), so it shouldn't grant management
// privileges over them either. Non-members can't GET the list at
// all (would leak names + emails); non-members trying to PUT get a
// 404 the same as on detail.
//
// PUT body: { memberIds: string[] }. Replaces the full list. The
// creator is always re-added if missing so they can't lock
// themselves out. Member IDs are filtered to ClientUsers under the
// same Client so a malicious payload can't grant cross-Client
// access.

async function loadJob(jobId: string, ctxClientId: string) {
  return prisma.clientJob.findFirst({
    where: { id: jobId, clientId: ctxClientId },
    include: {
      members: { select: { clientUserId: true } },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const job = await loadJob(id, ctx.clientId);
    if (!job || !canAccessClientJob(ctx, job)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const members = await prisma.clientJobMember.findMany({
      where: { clientJobId: id },
      include: {
        clientUser: { select: { id: true, name: true, email: true, role: true, title: true } },
      },
    });

    return NextResponse.json({
      postedById: job.postedById,
      members: members.map((m) => m.clientUser),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;

    const job = await loadJob(id, ctx.clientId);
    if (!job || !canAccessClientJob(ctx, job)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Any current member (or the creator) can mutate — collaborative
    // within the group. canAccessClientJob above already confirmed the
    // caller is either the creator or in the members list. Legacy-open
    // semantics ("zero members = visible to all") are gone everywhere
    // else, so they don't apply here either — every active ClientJob
    // has at least one member row (the migration backfills any
    // historical row that was missing one).
    const isMember = job.members.some((m) => m.clientUserId === ctx.clientUserId);
    const isCreator = job.postedById === ctx.clientUserId;
    const canManage = isCreator || isMember;
    if (!canManage) {
      return NextResponse.json(
        { error: "Only people already on this job can manage access." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawIds: string[] = Array.isArray(body.memberIds)
      ? body.memberIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // Validate every id belongs to this Client + is active. Filter
    // server-side so an admin doesn't accidentally promote an
    // inactive seat or grant cross-Client access via a copy-paste.
    const valid = rawIds.length
      ? await prisma.clientUser.findMany({
          where: { id: { in: rawIds }, clientId: ctx.clientId, isActive: true },
          select: { id: true },
        })
      : [];
    const finalIds = new Set<string>([
      job.postedById,
      ...valid.map((v) => v.id),
    ]);

    // Diff previous vs. new so we can notify only the people who
    // actually GAINED access. Just-saved users who already had a
    // membership row shouldn't get a duplicate email every time
    // someone hits Save on the panel.
    const previousIds = new Set(job.members.map((m) => m.clientUserId));
    const newlyAddedIds = Array.from(finalIds).filter((cuId) => !previousIds.has(cuId));

    await prisma.$transaction([
      prisma.clientJobMember.deleteMany({ where: { clientJobId: id } }),
      prisma.clientJobMember.createMany({
        data: Array.from(finalIds).map((cuId) => ({
          clientJobId: id,
          clientUserId: cuId,
        })),
      }),
    ]);

    // Fire-and-forget notification fan-out for newly-granted members.
    // Mirrors the email + in-app the /add-member endpoint sends so
    // the Manage Access panel and the Add Member form notify the
    // recipient the same way — there shouldn't be two different
    // class-of-service behaviours just because of which UI path
    // the recruiter happened to use.
    if (newlyAddedIds.length > 0) {
      const [clientInfo, inviter, jobInfo, newcomers] = await Promise.all([
        prisma.client.findUnique({
          where: { id: ctx.clientId },
          select: { name: true },
        }),
        prisma.clientUser.findUnique({
          where: { id: ctx.clientUserId },
          select: { name: true },
        }),
        prisma.clientJob.findUnique({
          where: { id },
          select: { title: true },
        }),
        prisma.clientUser.findMany({
          where: { id: { in: newlyAddedIds } },
          select: { id: true, name: true, email: true },
        }),
      ]);

      const baseUrl =
        process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
      const jobUrl = `${baseUrl}/client-portal/jobs/${id}`;
      const companyName = clientInfo?.name || "your team";
      const inviterName = inviter?.name || "A teammate";
      const jobTitle = jobInfo?.title || "this search";

      for (const u of newcomers) {
        // Skip the inviter themselves (they shouldn't email "you added
        // yourself") and the creator (who's auto-included on every
        // save — wasn't newly granted, just kept).
        if (u.id === ctx.clientUserId) continue;
        try {
          await prisma.clientNotification.create({
            data: {
              clientId: ctx.clientId,
              clientUserId: u.id,
              type: "job_access_granted",
              title: `${inviterName} added you to ${jobTitle}`,
              body: "Open the search to review shared candidates.",
              link: `/client-portal/jobs/${id}`,
            },
          });
        } catch (e) {
          console.error("[members PUT] in-app notification failed:", e);
        }
        try {
          await sendClientJobAccessGrantedEmail({
            to: u.email,
            memberName: u.name,
            inviterName,
            companyName,
            jobTitle,
            jobUrl,
          });
        } catch (e) {
          console.error("[members PUT] grant email failed:", e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: finalIds.size,
      notified: newlyAddedIds.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
