import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { sendCandidateSharedEmail } from "@/lib/email";
import { CLIENT_VISIBLE_STAGE_SET } from "@/lib/constants";
import { requireVerifiedEmail } from "@/lib/require-verified-email";
import { requireAdminResponse } from "@/lib/permissions";
import { canAccessJob } from "@/lib/job-access";
import { safeErrorMessage } from "@/lib/safe-error";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

    const ctx = await getOrgContext();
    const { id } = await params;
    const body = await request.json();

    const submission = await prisma.candidateSubmission.findFirst({
      where: { id },
      include: {
        job: { select: { id: true, organizationId: true, title: true, clientId: true } },
        candidate: { select: { firstName: true, lastName: true, ownerId: true } },
        stage: { select: { name: true, order: true } },
      },
    });

    if (!submission || submission.job.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ROADMAP.md #3 (security) + decision 10 jun 2026: the user can
    // mutate this submission's stage / share toggle iff they're (a)
    // assigned to the underlying job OR (b) the owner of the
    // candidate. (a) covers the normal multi-recruiter job kanban;
    // (b) lets the original sourcer act on their candidate even when
    // the submission lands in someone else's pipeline. 404 (not 403)
    // on purpose: matches the "Job not found" leak shape used
    // elsewhere so we don't differentiate "exists but not for you".
    const isAssigned = await canAccessJob(
      submission.job.id,
      ctx.organizationId,
      ctx.userId
    );
    const isCandidateOwner = submission.candidate.ownerId === ctx.userId;
    if (!isAssigned && !isCandidateOwner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (body.stageId) updateData.stageId = body.stageId;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // If the recruiter is moving the submission OUT of "Placed", the
    // linked placement record (if any) goes too. Placements only make
    // sense for candidates still at Placed; leaving an orphan record
    // would show stale revenue in /placements and a ghost in the
    // candidate's history. The client side prompts for confirmation
    // before sending the PATCH; here we just enforce the invariant.
    let deletedPlacementId: string | null = null;
    if (
      updateData.stageId &&
      updateData.stageId !== submission.stageId &&
      submission.stage.name === "Placed"
    ) {
      const linkedPlacement = await prisma.placement.findUnique({
        where: { submissionId: id },
        select: { id: true },
      });
      if (linkedPlacement) {
        await prisma.placement.delete({ where: { id: linkedPlacement.id } });
        deletedPlacementId = linkedPlacement.id;
      }
    }

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

    // Mirror agency stage → client stage on the way through. Whenever
    // the recruiter advances the candidate into a stage the client is
    // allowed to see (Submitted, Interviewing, Offered, …), find the
    // matching ClientPipelineStage by name on the same Client and set
    // clientStageId so the read-only kanban in the client portal
    // tracks the agency view automatically. Pre-Submitted moves
    // (Sourced, Internal Review) leave clientStageId alone — those
    // stages don't belong on the client side at all.
    let mirroredStageName: string | null = null;
    if (updateData.stageId && submission.job.clientId) {
      const newStage = await prisma.pipelineStage.findUnique({
        where: { id: updateData.stageId },
        select: { name: true },
      });
      mirroredStageName = newStage?.name || null;
      if (newStage && CLIENT_VISIBLE_STAGE_SET.has(newStage.name)) {
        const clientStage = await prisma.clientPipelineStage.findFirst({
          where: {
            clientId: submission.job.clientId,
            name: { equals: newStage.name, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (clientStage) {
          updateData.clientStageId = clientStage.id;
        }
      }
    }

    await prisma.candidateSubmission.update({
      where: { id },
      data: updateData,
    });

    // Documents que la agencia eligio compartir con el cliente. El
    // caller manda la lista FINAL deseada en selectedDocumentIds y
    // hacemos REPLACE — diff explicito (delete-only y create-only)
    // para no destruir metadata de rows que ya existian. Mismo PATCH
    // sirve para primer share (lista nueva) y para re-edit en
    // submissions ya compartidas. Si selectedDocumentIds es
    // undefined, no tocamos nada (PATCH de stage / etc).
    if (Array.isArray(body.selectedDocumentIds)) {
      // body.selectedDocumentIds es any[] (viene del JSON), asi que
      // filtramos a string[] explicitamente con un tipo concreto.
      // El predicate `is string` no narrowea cuando la base es any,
      // por eso fijamos el array con `as string[]` al final.
      const wantedRaw: string[] = (body.selectedDocumentIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      );
      // Validar contra los docs reales del candidate. Descartar ids
      // ajenos silenciosamente.
      const candidateDocs = wantedRaw.length > 0
        ? await prisma.document.findMany({
            where: {
              candidateId: submission.candidateId,
              id: { in: wantedRaw },
            },
            select: { id: true },
          })
        : [];
      const validIds = new Set<string>(candidateDocs.map((d: { id: string }) => d.id));
      const wanted = new Set<string>(wantedRaw.filter((x: string) => validIds.has(x)));
      const existing = await prisma.submissionDocument.findMany({
        where: { submissionId: id },
        select: { documentId: true },
      });
      const currentIds = new Set<string>(existing.map((x: { documentId: string }) => x.documentId));
      const toAdd = Array.from(wanted).filter((x: string) => !currentIds.has(x));
      const toRemove = Array.from(currentIds).filter((x: string) => !wanted.has(x));
      if (toRemove.length > 0) {
        await prisma.submissionDocument.deleteMany({
          where: { submissionId: id, documentId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await prisma.submissionDocument.createMany({
          data: toAdd.map((documentId) => ({
            submissionId: id,
            documentId,
            addedById: ctx.userId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Log stage change — covers both explicit moves (body.stageId) and the
    // implicit advance to "Submitted" we trigger from the share toggle.
    // Metadata carries the structured transition so reporting widgets
    // (e.g. Recruiter Performance's "Offers" tile) can count every
    // candidate that ever passed through a given stage, instead of
    // only the ones currently sitting there.
    //
    // QA P3 (2026-06-16): skip no-op transitions. Si compartis un
    // candidato que ya estaba en "Submitted", el share toggle dispara
    // un implicit move a Submitted → updateData.stageId === stageId
    // actual y antes loggeabamos "moved from Submitted to Submitted".
    if (updateData.stageId && updateData.stageId !== submission.stageId) {
      await logActivity({
        action: "submission.stage_changed",
        description: `${ctx.userName} moved ${submission.candidate.firstName} ${submission.candidate.lastName} from "${submission.stage.name}" to "${mirroredStageName || "another stage"}" in "${submission.job.title}"`,
        userId: ctx.userId,
        candidateId: submission.candidateId,
        organizationId: ctx.organizationId,
        metadata: {
          submissionId: id,
          jobId: submission.job.id,
          fromStage: submission.stage.name,
          toStage: mirroredStageName || null,
        },
      });
    }

    if (deletedPlacementId) {
      await logActivity({
        action: "PLACEMENT_DELETED",
        description: `Placement removed because ${submission.candidate.firstName} ${submission.candidate.lastName} was moved out of "Placed"`,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });
    }

    // Handle share → fire notification, email, optional note
    if (isTogglingShare && willBeShared && !wasShared && submission.job.clientId) {
      const candidateName = `${submission.candidate.firstName} ${submission.candidate.lastName}`.trim();
      const shareNote = typeof body.shareNote === "string" ? body.shareNote.trim() : "";
      const notifyViaEmail = body.notifyViaEmail !== false; // default true

      // Audience for this share. Rule: only ClientUsers who are
      // members of THIS specific Job, not every contact at the
      // client. A hiring manager on a different search at the same
      // company shouldn't get a heads-up about a candidate they
      // weren't invited to evaluate.
      //
      // The link runs Job → accepted FirmEngagement → ClientJob →
      // ClientJobMember[]. If the Job has no associated ClientJob
      // (recruiter-created without a person-level invite flow),
      // fall back to the full client roster — that's the older
      // direct-create flow and we don't want shares to silently
      // notify nobody.
      const clientJob = await prisma.clientJob.findFirst({
        where: {
          engagements: {
            some: { jobId: submission.jobId, status: "ACCEPTED" },
          },
        },
        select: { id: true },
      });

      const audience: { id: string; email: string | null; name: string | null }[] = clientJob
        ? (
            await prisma.clientJobMember.findMany({
              where: {
                clientJobId: clientJob.id,
                clientUser: { isActive: true },
              },
              select: {
                clientUser: { select: { id: true, email: true, name: true } },
              },
            })
          ).map((m: { clientUser: { id: string; email: string; name: string | null } }) => ({ id: m.clientUser.id, email: m.clientUser.email, name: m.clientUser.name }))
        : await prisma.clientUser.findMany({
            where: { clientId: submission.job.clientId, isActive: true },
            select: { id: true, email: true, name: true },
          });

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

      // In-app notification: one per audience member's inbox.
      try {
        if (audience.length > 0) {
          await prisma.clientNotification.createMany({
            data: audience.map((cu) => ({
              clientId: submission.job.clientId!,
              clientUserId: cu.id,
              type: "candidate_shared",
              title: `New candidate for ${submission.job.title}`,
              body: `${candidateName} was shared by ${ctx.userName}${shareNote ? ". Note attached." : ""}`,
              link: `/client-portal/candidates/${id}`,
              submissionId: id,
            })),
          });
        }
      } catch (err) {
        console.error("[share] failed to create ClientNotifications:", err);
      }

      // Email notifications (fire-and-forget; don't fail request).
      // Same audience as in-app — no extra fan-out to client
      // admins or contactEmail.
      if (notifyViaEmail) {
        try {
          const [client, org] = await Promise.all([
            prisma.client.findUnique({
              where: { id: submission.job.clientId },
              select: { name: true },
            }),
            prisma.organization.findUnique({
              where: { id: ctx.organizationId },
              select: { name: true },
            }),
          ]);

          // Dedupe by lowercased email but keep the recipient's name
          // so the greeting can use "Hi Federico," instead of the
          // generic "Hi there,".
          const recipients = new Map<string, { name: string | null }>();
          for (const cu of audience) {
            if (!cu.email) continue;
            const key = cu.email.toLowerCase();
            if (!recipients.has(key)) recipients.set(key, { name: cu.name });
          }

          const portalBase = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
          const portalUrl = `${portalBase}/client-portal/candidates/${id}`;

          const emailPromises = Array.from(recipients.entries()).map(([to, meta]) =>
            sendCandidateSharedEmail({
              to,
              candidateName,
              jobTitle: submission.job.title,
              recruiterName: ctx.userName || "Your recruiter",
              firmName: org?.name || "Recruiting firm",
              clientName: client?.name || "your team",
              portalUrl,
              note: shareNote || undefined,
              recipientName: meta.name || undefined,
              recruiterEmail: ctx.userEmail || undefined,
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
        // Structured payload powers the "Submissions" metric on the
        // Recruiter Performance widget — counts share events (= when
        // the candidate actually reaches the client), deduped by
        // submissionId so re-shares after an un-share don't double.
        metadata: {
          submissionId: id,
          jobId: submission.job.id,
        },
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
        metadata: {
          submissionId: id,
          jobId: submission.job.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      isSharedWithClient: willBeShared,
    });
  } catch (error: any) {
    console.error("[submissions PATCH]", error);
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    const submission = await prisma.candidateSubmission.findFirst({
      where: { id },
      include: {
        job: { select: { id: true, organizationId: true } },
        candidate: { select: { ownerId: true } },
      },
    });

    if (!submission || submission.job.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Same gate semantics as the PATCH above: assigned to the job OR
    // owner of the candidate. Admins included — no role bypass on
    // the visibility rule (see lib/job-access.ts).
    const isAssigned = await canAccessJob(
      submission.job.id,
      ctx.organizationId,
      ctx.userId
    );
    const isCandidateOwner = submission.candidate.ownerId === ctx.userId;
    if (!isAssigned && !isCandidateOwner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.candidateSubmission.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
