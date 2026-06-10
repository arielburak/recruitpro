import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { requireActiveSubscription, SubscriptionError } from "@/lib/subscription-guard";
import { DEFAULT_STAGES } from "@/lib/constants";
import { sendEngagementAcceptedEmail } from "@/lib/email";

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
          include: {
            client: { select: { id: true, name: true } },
            // postedBy = ClientUser que invito a la firma. Lo usamos
            // para notificar de vuelta cuando aceptamos: in-app
            // notification al bell + mail directo al inviter. Title
            // ademas, para sembrar el Contact en el book del firm.
            postedBy: { select: { id: true, name: true, email: true, title: true, isActive: true } },
          },
        },
        organization: { select: { name: true } },
      },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    if (engagement.status !== "PENDING") {
      return NextResponse.json({ error: "Already responded" }, { status: 400 });
    }

    // Only the invited person can respond. Admins don't get to respond on
    // behalf of others — that would leak the invite into their inbox,
    // which is exactly what the person-level model exists to prevent.
    // Legacy rows (invitedUserId null) are the only thing admins can
    // touch, because nobody else knows they exist.
    const isInvitedUser =
      engagement.invitedUserId !== null && engagement.invitedUserId === ctx.userId;
    const isLegacyAdminFallback =
      engagement.invitedUserId === null && ctx.role === "ADMIN";
    if (!isInvitedUser && !isLegacyAdminFallback) {
      return NextResponse.json(
        { error: "Only the invited recruiter can respond to this invitation" },
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

      // Critical: the agency-side /clients listing (and the access
      // helpers in lib/client-access.ts) authorize via the
      // OrganizationClient pivot, NOT via Client.organizationId.
      // Without this row the Client we just created — or found —
      // doesn't appear in the firm's Clients tab even though the
      // engagement was accepted. Idempotent upsert covers re-accepts
      // and Clients that already had this pivot from a prior engagement.
      await prisma.organizationClient.upsert({
        where: {
          organizationId_clientId: {
            organizationId: ctx.organizationId,
            clientId: client.id,
          },
        },
        update: {},
        create: {
          organizationId: ctx.organizationId,
          clientId: client.id,
        },
      });

      // Seed a Contact for the ClientUser who invited the firm, so the
      // Client doesn't open as a bare row with no point-of-contact.
      // One-time, idempotent: if the firm already has a Contact at this
      // Client with the same email, we leave the existing record alone
      // (the recruiter may have edited it after the first accept). The
      // FIRST contact at a Client gets isPrimary=true so it surfaces on
      // /contacts and the client list.
      const inviter = engagement.clientJob.postedBy;
      if (inviter?.email) {
        const existingContact = await prisma.contact.findFirst({
          where: { clientId: client.id, email: inviter.email },
          select: { id: true },
        });
        if (!existingContact) {
          const [firstName, ...rest] = (inviter.name || "").trim().split(/\s+/);
          const lastName = rest.join(" ");
          const contactCount = await prisma.contact.count({ where: { clientId: client.id } });
          await prisma.contact.create({
            data: {
              firstName: firstName || inviter.email,
              lastName: lastName || "",
              title: inviter.title || null,
              email: inviter.email,
              clientId: client.id,
              organizationId: ctx.organizationId,
              isPrimary: contactCount === 0,
            },
          });
        }
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

      // Avisarle al cliente que invito (in-app bell + mail). El
      // postedBy es el ClientUser que disparo la invitacion original;
      // si esta activo, le mandamos ambas. Falla silencioso para no
      // bloquear el accept si el mail/notif tiran.
      try {
        const inviter = engagement.clientJob.postedBy;
        const firmName = engagement.organization?.name || "A recruiting firm";
        const link = `/client-portal/jobs/${engagement.clientJobId}`;
        const title = `${firmName} accepted ${engagement.clientJob.title}`;
        if (inviter?.isActive) {
          await prisma.clientNotification.create({
            data: {
              clientId: engagement.clientJob.client.id,
              clientUserId: inviter.id,
              type: "engagement_accepted",
              title,
              body: `They can start sharing candidates now.`,
              link,
            },
          });
        } else {
          // Sin postedBy activo (legacy / removed), notif al espacio
          // del cliente (sin scope a un user puntual) asi alguien del
          // team lo ve.
          await prisma.clientNotification.create({
            data: {
              clientId: engagement.clientJob.client.id,
              type: "engagement_accepted",
              title,
              body: `They can start sharing candidates now.`,
              link,
            },
          });
        }
        if (inviter?.email && inviter.isActive) {
          const origin = process.env.NEXTAUTH_URL || "";
          sendEngagementAcceptedEmail({
            to: inviter.email,
            inviterName: inviter.name || "",
            firmName,
            jobTitle: engagement.clientJob.title,
            jobUrl: `${origin}${link}`,
          }).catch((e) =>
            console.error("[engagement.accept] inviter email failed:", e),
          );
        }
      } catch (e) {
        console.error("[engagement.accept] notify-inviter failed:", e);
      }

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
