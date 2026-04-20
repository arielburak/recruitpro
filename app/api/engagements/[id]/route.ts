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

      // Create a Job in the recruiter's org from the ClientJob
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

      // Create the canonical 9 pipeline stages
      await prisma.pipelineStage.createMany({
        data: DEFAULT_STAGES.map((s, i) => ({
          name: s.name,
          color: s.color,
          isTerminal: s.isTerminal,
          kind: s.kind,
          order: i,
          jobId: job.id,
        })),
      });

      // Update engagement
      await prisma.firmEngagement.update({
        where: { id },
        data: {
          status: "ACCEPTED",
          jobId: job.id,
          respondedAt: new Date(),
        },
      });

      await logActivity({
        action: "engagement.accepted",
        description: `${ctx.userName} accepted a search request from ${engagement.clientJob.client.name} for ${engagement.clientJob.title}`,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });

      return NextResponse.json({ success: true, jobId: job.id });
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
