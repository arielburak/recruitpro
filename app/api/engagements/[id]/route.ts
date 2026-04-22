import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { requireActiveSubscription, SubscriptionError } from "@/lib/subscription-guard";
import { DEFAULT_STAGES } from "@/lib/constants";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const { action } = await request.json(); // "accept" or "decline"

    const engagement = await prisma.firmEngagement.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        clientJob: {
          include: { client: { select: { id: true, name: true } } },
        },
      },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    if (engagement.status !== "PENDING") {
      return NextResponse.json({ error: "Already responded" }, { status: 400 });
    }

    // Only the invited person — or a firm admin acting on their behalf —
    // can respond. This mirrors the visibility rule in /api/engagements
    // (non-admins only see their own invites) so you can't accept
    // something you weren't meant to see.
    const isAdmin = ctx.role === "ADMIN";
    const isInvitedUser =
      engagement.invitedUserId !== null && engagement.invitedUserId === ctx.userId;
    if (!isAdmin && !isInvitedUser) {
      return NextResponse.json(
        { error: "Only the invited recruiter or a firm admin can respond to this" },
        { status: 403 }
      );
    }

    if (action === "accept") {
      // Verify active subscription before accepting
      try {
        await requireActiveSubscription(ctx.organizationId);
      } catch (e) {
        if (e instanceof SubscriptionError) {
          return NextResponse.json(
            { error: e.message, code: "SUBSCRIPTION_REQUIRED" },
            { status: 403 }
          );
        }
        throw e;
      }

      // Ensure the client exists in the recruiter's org
      let client = await prisma.client.findFirst({
        where: { name: engagement.clientJob.client.name, organizationId: ctx.organizationId },
      });

      if (!client) {
        client = await prisma.client.create({
          data: {
            name: engagement.clientJob.client.name,
            organizationId: ctx.organizationId,
          },
        });
      }

      // If another recruiter at this firm already accepted this same
      // ClientJob, reuse that Job instead of spawning a duplicate — we
      // just add the current user as an additional assignee. The
      // sibling-engagement lookup matches by (clientJobId,
      // organizationId) with a jobId set, which is guaranteed once
      // they've accepted.
      const siblingEngagement = await prisma.firmEngagement.findFirst({
        where: {
          clientJobId: engagement.clientJobId,
          organizationId: ctx.organizationId,
          jobId: { not: null },
          NOT: { id: engagement.id },
        },
        select: { jobId: true },
      });

      let jobId = siblingEngagement?.jobId || null;

      if (!jobId) {
        const job = await prisma.job.create({
          data: {
            title: engagement.clientJob.title,
            description: engagement.clientJob.description || null,
            location: engagement.clientJob.location || null,
            salary: engagement.clientJob.salaryRange || null,
            status: "ACTIVE",
            clientId: client.id,
            organizationId: ctx.organizationId,
          },
        });
        jobId = job.id;

        // Create the canonical 9 pipeline stages
        await prisma.pipelineStage.createMany({
          data: DEFAULT_STAGES.map((s, i) => ({
            name: s.name,
            color: s.color,
            isTerminal: s.isTerminal,
            kind: s.kind,
            order: i,
            jobId: jobId!,
          })),
        });
      }

      // Make sure the accepting user can actually see and work on the
      // Job. Visibility for non-admins is gated on JobAssignment, so an
      // accept without an assignment means the person who just accepted
      // wouldn't see their own job.
      await prisma.jobAssignment.upsert({
        where: { jobId_userId: { jobId: jobId!, userId: ctx.userId } },
        update: {},
        create: { jobId: jobId!, userId: ctx.userId },
      });

      await prisma.firmEngagement.update({
        where: { id },
        data: {
          status: "ACCEPTED",
          jobId,
          respondedAt: new Date(),
        },
      });

      await logActivity({
        action: "engagement.accepted",
        description: `${ctx.userName} accepted a search request from ${engagement.clientJob.client.name} for ${engagement.clientJob.title}`,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });

      return NextResponse.json({ success: true, jobId });
    } else if (action === "decline") {
      await prisma.firmEngagement.update({
        where: { id },
        data: {
          status: "DECLINED",
          respondedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
