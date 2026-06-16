import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { sendClientPortalShareEmail, sendClientSetPasswordEmail } from "@/lib/email";
import { DEFAULT_STAGES } from "@/lib/constants";
import crypto from "crypto";
import { requireVerifiedEmail } from "@/lib/require-verified-email";

export async function POST(request: Request) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

    const ctx = await getOrgContext();
    const body = await request.json();
    const { clientId, jobId, inviteEmail: rawInviteEmail, inviteName } = body;

    if (!rawInviteEmail || typeof rawInviteEmail !== "string") {
      return NextResponse.json({ error: "Email address is required" }, { status: 400 });
    }

    // Normalize email aggressively. The old (case-sensitive, untrimmed)
    // lookup was silently missing existing ClientUsers when the agency
    // re-typed the same address with different casing, which fell through
    // to the "create new account + send set-password" branch — confusing
    // the hiring contact who already had a portal login.
    const inviteEmail = rawInviteEmail.trim().toLowerCase();

    // Verify the agency is engaged with this client. The old
    // `Client.organizationId === orgId` filter only matched the agency
    // that originally created the row, so an agency that engaged with
    // a pre-existing shared client (post-PR #139) got a silent 404
    // here — the invite never reached the email-send. Engagement is
    // the source of truth for "this firm can act on this Client."
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        engagedOrganizations: { some: { organizationId: ctx.organizationId } },
      },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json(
        {
          error:
            "This client isn't in your firm's engagements. If you're sure it's the right company, open it from /clients first to re-engage.",
        },
        { status: 404 }
      );
    }

    // One email → one Client (DB-enforced via `email @unique` on
    // ClientUser). If the email already exists ANYWHERE in the system,
    // it has to be at THIS Client — otherwise the recruiter is trying
    // to attach a contact who belongs to another company. Reject with
    // a clear message so they can use the right address.
    const existing = await prisma.clientUser.findUnique({
      where: { email: inviteEmail },
      select: { id: true, clientId: true, client: { select: { name: true } } },
    });
    if (existing && existing.clientId !== client.id) {
      return NextResponse.json(
        {
          error: `This email is already in use by another client (${existing.client.name}). Use a different work or personal address for ${client.name}.`,
        },
        { status: 409 }
      );
    }

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    // Deep-link target the email CTA points to. When sharing a specific
    // job we want the recipient to land on that job, not the dashboard.
    // /go is kept as the indirection target for backwards-compat with
    // already-sent emails; it just redirects to the destination now.
    const deepLinkPath = jobId
      ? `/client-portal/go?jobId=${jobId}`
      : "/client-portal/dashboard";
    const portalUrl = `${baseUrl}/client-portal/login?callbackUrl=${encodeURIComponent(deepLinkPath)}`;

    // Fetch the source Job. We need not just the title (for the email)
    // but also the body — when sharing a specific job for the first
    // time we mirror it into a ClientJob so the client sees the search
    // in their portal, read-only. Cached as a local because we use it
    // for both the email content and the mirror.
    let sourceJob:
      | {
          title: string;
          description: string | null;
          location: string | null;
          salary: string | null;
          currency: string;
          workMode: string;
          status: string;
          _count: { submissions: number };
        }
      | null = null;
    let jobTitle: string | undefined;
    let candidateCount: number | undefined;
    if (jobId) {
      sourceJob = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          title: true,
          description: true,
          location: true,
          salary: true,
          currency: true,
          workMode: true,
          status: true,
          _count: {
            select: {
              submissions: { where: { isSharedWithClient: true } },
            },
          },
        },
      });
      jobTitle = sourceJob?.title;
      candidateCount = sourceJob?._count.submissions;
    }

    // Find-or-create ClientUser for this email at THIS Client. By here
    // we know the email is either free, or already attached to this
    // same Client (the cross-Client case was rejected above).
    let clientUser = await prisma.clientUser.findUnique({
      where: { email: inviteEmail },
    });

    if (!clientUser) {
      clientUser = await prisma.clientUser.create({
        data: {
          email: inviteEmail,
          name: inviteName || inviteEmail.split("@")[0],
          clientId: client.id,
        },
      });
    }

    // Mirror as a Contact too, so the recruiter sees this person in
    // the CRM right away — both on /contacts and on the Client detail
    // page. Without this, Job-invited people only existed as
    // ClientUser rows, which the per-Client Contacts subpage didn't
    // surface. Find-or-create by (clientId, email) to avoid stacking
    // duplicates if the recruiter re-invites the same person.
    const [firstNameGuess, ...restGuess] = (
      inviteName || clientUser.name || inviteEmail.split("@")[0]
    )
      .trim()
      .split(/\s+/);
    const lastNameGuess = restGuess.join(" ") || "";
    const existingContact = await prisma.contact.findFirst({
      where: { clientId: client.id, email: inviteEmail },
      select: { id: true },
    });
    if (!existingContact) {
      await prisma.contact.create({
        data: {
          firstName: firstNameGuess || inviteEmail,
          lastName: lastNameGuess,
          email: inviteEmail,
          clientId: client.id,
          organizationId: ctx.organizationId,
        },
      });
    }

    // Mirror the agency Job into a ClientJob the first time we share
    // it. After this the client sees the search in their /jobs list
    // and can dive into the read-only detail view with the pipeline,
    // notes and documents tabs — without ever being able to edit
    // description / requirements / files (the agency owns those). We
    // key the mirror by sourceJobId (unique) so re-inviting more
    // contacts to the same Job doesn't stack duplicates.
    let mirroredClientJobId: string | null = null;
    if (jobId && sourceJob) {
      let existingMirror = await prisma.clientJob.findUnique({
        where: { sourceJobId: jobId },
        select: { id: true },
      });
      // Also dedup against a ClientJob the client posted themselves
      // for the same underlying agency Job. Without this, if the
      // client posted the search FIRST (creating a ClientJob) and
      // then the agency runs "Invite Client" against the agency Job
      // that backs the engagement, we'd create a SECOND ClientJob
      // and the client portal would surface the same search twice.
      if (!existingMirror) {
        const originalLinkedByEngagement = await prisma.clientJob.findFirst({
          where: {
            clientId: client.id,
            engagements: { some: { jobId } },
          },
          select: { id: true },
        });
        if (originalLinkedByEngagement) {
          existingMirror = originalLinkedByEngagement;
        }
      }
      if (existingMirror) {
        mirroredClientJobId = existingMirror.id;
      } else {
        // Make sure the client has pipeline stages seeded. Quick-share
        // and OAuth signup already do this, but a Client created via
        // a manual /api/clients POST in the early days might not, so
        // we backfill defensively before the first mirror.
        const stageCount = await prisma.clientPipelineStage.count({
          where: { clientId: client.id },
        });
        if (stageCount === 0) {
          await prisma.clientPipelineStage.createMany({
            data: DEFAULT_STAGES.map((s, i) => ({
              name: s.name,
              order: i,
              color: s.color,
              isTerminal: s.isTerminal,
              kind: s.kind,
              clientId: client.id,
            })),
          });
        }
        // Map agency JobStatus enum onto the free-form ClientJob.status
        // string. They share the OPEN / ACTIVE / FILLED / CLOSED vocab
        // so the cast is essentially identity.
        const mirror = await prisma.clientJob.create({
          data: {
            title: sourceJob.title,
            description: sourceJob.description,
            location: sourceJob.location,
            salaryRange: sourceJob.salary,
            salaryCurrency: sourceJob.currency,
            isRemote: sourceJob.workMode !== "ON_SITE",
            status: sourceJob.status,
            clientId: client.id,
            // The invited person is recorded as the receiver of the
            // search on the client side. Combined with createdByAgency
            // the UI knows the original author was the firm — but the
            // recipient needs SOME ClientUser to be the postedBy since
            // the column is required.
            postedById: clientUser.id,
            createdByAgency: true,
            sourceJobId: jobId,
            // Seed the explicit member list with the recipient so
            // visibility is strictly opt-in from day one. Without
            // this the row falls into the (deprecated) legacy-open
            // bucket and every teammate at the client sees the job.
            members: {
              create: [{ clientUserId: clientUser.id }],
            },
          },
          select: { id: true },
        });
        mirroredClientJobId = mirror.id;
      }
      // Link the engagement to the mirror. Status: ACCEPTED because by
      // here the agency has actively shared with the client; no
      // pending step from the client's side. clientJobId is required
      // on FirmEngagement, so the engagement only exists once the
      // mirror does. Find-or-create by (clientJobId, organizationId).
      const existingEngagement = await prisma.firmEngagement.findFirst({
        where: {
          clientJobId: mirroredClientJobId,
          organizationId: ctx.organizationId,
        },
        select: { id: true },
      });
      if (!existingEngagement) {
        await prisma.firmEngagement.create({
          data: {
            clientJobId: mirroredClientJobId,
            organizationId: ctx.organizationId,
            jobId,
            invitedEmail: inviteEmail,
            status: "ACCEPTED",
            respondedAt: new Date(),
          },
        });
      } else {
        await prisma.firmEngagement.updateMany({
          where: { id: existingEngagement.id },
          data: { jobId, status: "ACCEPTED", respondedAt: new Date() },
        });
      }

      // Make sure the invited ClientUser is on the member list of
      // the ClientJob. Was a bug: the initial mirror seeded the
      // FIRST recipient but every subsequent agency-side invite
      // re-used the existing mirror and never added the new user
      // — so a second hiring manager invited from the same Job by
      // a recruiter got portal access but couldn't open the Job.
      // Upsert keeps it idempotent.
      try {
        await prisma.clientJobMember.upsert({
          where: {
            clientJobId_clientUserId: {
              clientJobId: mirroredClientJobId,
              clientUserId: clientUser.id,
            },
          },
          update: {},
          create: {
            clientJobId: mirroredClientJobId,
            clientUserId: clientUser.id,
          },
        });
      } catch (e) {
        console.error("[tokens] upsert ClientJobMember failed:", e);
      }
    }

    const hasPassword = !!clientUser.passwordHash;
    const recipientName = clientUser.name;

    // Get org name for email
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });
    const firmName = org?.name || "Your recruiting firm";

    // Mail sends are fire-and-forget. The user reported a 1–2s wait
    // on the "Send Invite" button — Resend round-trips were happening
    // in series with await, blocking the response. The DB state is
    // already committed by this point; if the mail itself fails the
    // user can re-send via the resend endpoint, and the in-app
    // notification we create below is the dependable surface anyway.
    if (hasPassword) {
      sendClientPortalShareEmail({
        to: inviteEmail,
        portalUrl,
        recruiterName: ctx.userName,
        firmName,
        jobTitle,
        clientName: recipientName,
        candidateCount,
      }).catch((err) =>
        console.error("[tokens] share mail failed:", err),
      );
    } else {
      // New user or user without password — mint a set-password token
      // then fire the mail. Token creation stays awaited (the token
      // has to exist before any retry path can resend), but the mail
      // dispatch itself doesn't block the response.
      const setPasswordToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await prisma.clientPortalToken.create({
        data: {
          token: setPasswordToken,
          clientId: client.id,
          expiresAt,
          isActive: true,
        },
      });

      const setPasswordUrl =
        `${baseUrl}/client-portal/set-password?token=${setPasswordToken}` +
        `&email=${encodeURIComponent(inviteEmail)}` +
        (jobId ? `&callbackUrl=${encodeURIComponent(deepLinkPath)}` : "");

      sendClientSetPasswordEmail({
        to: inviteEmail,
        setPasswordUrl,
        clientName: recipientName,
        firmName,
      }).catch((err) =>
        console.error("[tokens] set-password mail failed:", err),
      );
    }

    // In-app notification for the invited ClientUser. Email is best-effort
    // (filters, missed in inbox, etc.); the bell on the portal is the
    // dependable surface. Title varies based on whether we have a specific
    // job context — generic "you got portal access" otherwise.
    try {
      const notifTitle = jobTitle
        ? `${firmName} shared ${jobTitle} with you`
        : `${firmName} invited you to the client portal`;
      const notifBody = jobTitle && candidateCount
        ? `${candidateCount} candidate${candidateCount === 1 ? "" : "s"} shared. Open the portal to review.`
        : null;
      await prisma.clientNotification.create({
        data: {
          clientId: client.id,
          clientUserId: clientUser.id,
          type: "candidate_shared",
          title: notifTitle,
          body: notifBody,
          // The client portal navigates by ClientJob.id, not the
          // agency-side Job.id. Using `jobId` here gave a 404
          // ("Job not found.") on every click. Fall back to the
          // dashboard if the mirror wasn't created (no jobId in
          // the invite payload at all).
          link: mirroredClientJobId
            ? `/client-portal/jobs/${mirroredClientJobId}`
            : "/client-portal/dashboard",
        },
      });
    } catch (e) {
      console.error("[invite] notification create failed:", e);
    }

    return NextResponse.json({
      success: true,
      emailsSent: 1,
    }, { status: 201 });
  } catch (error: any) {
    console.error("[invite] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
