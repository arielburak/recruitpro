import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { sendCandidateSharedEmail } from "@/lib/email";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const body = await request.json();

    const submission = await prisma.candidateSubmission.findFirst({
      where: { id },
      include: {
        job: { select: { id: true, organizationId: true, title: true, clientId: true } },
        candidate: { select: { firstName: true, lastName: true } },
        stage: { select: { name: true, order: true } },
      },
    });

    if (!submission || submission.job.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (body.stageId) updateData.stageId = body.stageId;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const isTogglingShare = body.isSharedWithClient !== undefined;
    const wasShared = submission.isSharedWithClient;
    const willBeShared = isTogglingShare ? !!body.isSharedWithClient : wasShared;

    if (isTogglingShare) {
      updateData.isSharedWithClient = willBeShared;

      if (willBeShared && !wasShared) {
        // Sharing for the first time (or re-sharing after unshare)
        updateData.sharedAt = new Date();

        // Auto-advance to "Submitted" if the candidate is still in an
        // earlier stage (Sourced / Internal Review). Sharing IS the act of
        // submitting to the client, so the agency-side pipeline should
        // reflect that. If the recruiter is already past Submitted (e.g.,
        // Interviewing) we leave the stage alone.
        if (!body.stageId) {
          const submittedStage = await prisma.pipelineStage.findFirst({
            where: { jobId: submission.job.id, name: "Submitted" },
            select: { id: true, order: true },
          });
          if (submittedStage && submission.stage.order < submittedStage.order) {
            updateData.stageId = submittedStage.id;
          }
        }

        // Auto-assign clientStage to the first stage if not set
        if (!submission.clientStageId && submission.job.clientId) {
          const firstStage = await prisma.clientPipelineStage.findFirst({
            where: { clientId: submission.job.clientId },
            orderBy: { order: "asc" },
            select: { id: true },
          });
          if (firstStage) {
            updateData.clientStageId = firstStage.id;
          }
        }
      }
    }

    await prisma.candidateSubmission.update({
      where: { id },
      data: updateData,
    });

    // Log stage change — covers both explicit moves (body.stageId) and the
    // implicit advance to "Submitted" we trigger from the share toggle.
    if (updateData.stageId) {
      const newStage = await prisma.pipelineStage.findUnique({
        where: { id: updateData.stageId },
      });
      await logActivity({
        action: "submission.stage_changed",
        description: `${ctx.userName} moved ${submission.candidate.firstName} ${submission.candidate.lastName} from "${submission.stage.name}" to "${newStage?.name}" in "${submission.job.title}"`,
        userId: ctx.userId,
        candidateId: submission.candidateId,
        organizationId: ctx.organizationId,
      });
    }

    // Handle share → fire notification, email, optional note
    if (isTogglingShare && willBeShared && !wasShared && submission.job.clientId) {
      const candidateName = `${submission.candidate.firstName} ${submission.candidate.lastName}`.trim();
      const shareNote = typeof body.shareNote === "string" ? body.shareNote.trim() : "";
      const notifyViaEmail = body.notifyViaEmail !== false; // default true

      // Save note as a CLIENT_VISIBLE comment
      if (shareNote) {
        await prisma.comment.create({
          data: {
            content: shareNote,
            type: "CLIENT_VISIBLE",
            submissionId: id,
            userId: ctx.userId,
          },
        });
      }

      // In-app notification: one per active client user (personal inbox)
      try {
        const activeClientUsers = await prisma.clientUser.findMany({
          where: { clientId: submission.job.clientId, isActive: true },
          select: { id: true },
        });
        await prisma.clientNotification.createMany({
          data: activeClientUsers.map((cu) => ({
            clientId: submission.job.clientId!,
            clientUserId: cu.id,
            type: "candidate_shared",
            title: `New candidate for ${submission.job.title}`,
            body: `${candidateName} was shared by ${ctx.userName}${shareNote ? ". Note attached." : ""}`,
            link: `/client-portal/candidates/${id}`,
            submissionId: id,
          })),
        });
      } catch (err) {
        console.error("[share] failed to create ClientNotifications:", err);
      }

      // Email notifications (fire-and-forget; don't fail request)
      if (notifyViaEmail) {
        try {
          const [client, clientAdmins, org] = await Promise.all([
            prisma.client.findUnique({
              where: { id: submission.job.clientId },
              select: { name: true, contactEmail: true },
            }),
            prisma.clientUser.findMany({
              where: {
                clientId: submission.job.clientId,
                isActive: true,
                role: "ADMIN",
              },
              select: { email: true },
            }),
            prisma.organization.findUnique({
              where: { id: ctx.organizationId },
              select: { name: true },
            }),
          ]);

          const recipients = new Set<string>();
          if (client?.contactEmail) recipients.add(client.contactEmail.toLowerCase());
          for (const a of clientAdmins) {
            if (a.email) recipients.add(a.email.toLowerCase());
          }

          const portalBase = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
          const portalUrl = `${portalBase}/client-portal/candidates/${id}`;

          const emailPromises = Array.from(recipients).map((to) =>
            sendCandidateSharedEmail({
              to,
              candidateName,
              jobTitle: submission.job.title,
              recruiterName: ctx.userName || "Your recruiter",
              firmName: org?.name || "Recruiting firm",
              clientName: client?.name || "your team",
              portalUrl,
              note: shareNote || undefined,
            }).catch((err) => console.error(`[share email] failed to send to ${to}:`, err))
          );
          await Promise.all(emailPromises);
        } catch (err) {
          console.error("[share notify] failed:", err);
        }
      }

      await logActivity({
        action: "submission.shared",
        description: `${ctx.userName} shared ${candidateName} with ${submission.job.title}'s client`,
        userId: ctx.userId,
        candidateId: submission.candidateId,
        organizationId: ctx.organizationId,
      });
    }

    // Un-share: keep the submission but mark it so it doesn't appear in client portal
    if (isTogglingShare && !willBeShared && wasShared) {
      await logActivity({
        action: "submission.unshared",
        description: `${ctx.userName} un-shared ${submission.candidate.firstName} ${submission.candidate.lastName} from ${submission.job.title}`,
        userId: ctx.userId,
        candidateId: submission.candidateId,
        organizationId: ctx.organizationId,
      });
    }

    return NextResponse.json({
      success: true,
      isSharedWithClient: willBeShared,
    });
  } catch (error: any) {
    console.error("[submissions PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const submission = await prisma.candidateSubmission.findFirst({
      where: { id },
      include: { job: { select: { organizationId: true } } },
    });

    if (!submission || submission.job.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.candidateSubmission.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
