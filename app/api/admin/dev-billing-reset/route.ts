import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";

// Dev-only endpoint para resetear billing state de la org actual y
// poder testear el flow completo sin esperar 7 dias ni crear cuenta
// nueva.
//
// Gates de seguridad (los 3 tienen que pasar):
//   1. Caller autenticado (getOrgContext throws si no).
//   2. Caller ADMIN de la org.
//   3. VERCEL_ENV !== "production". El endpoint queda dormido en
//      production por env check — no hace falta removerlo manualmente
//      antes del push final a main.
//
// Body: { mode: "reset" | "expire" }
//   reset  → cancela Stripe subs + wipea data + reset Subscription
//   expire → solo backdatea trialEndsAt (no wipea, no toca Stripe)

type Mode = "reset" | "expire";

export async function POST(request: Request) {
  const ctx = await getOrgContext();
  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { error: "This endpoint is disabled in production." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const mode: Mode = body?.mode === "expire" ? "expire" : "reset";

  const orgId = ctx.organizationId;
  const log: string[] = [];

  // ── EXPIRE MODE ────────────────────────────────────────────────
  if (mode === "expire") {
    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: { trialEndsAt: expiredAt },
    });
    log.push(`Subscription.trialEndsAt backdateado a ${expiredAt.toISOString()}.`);
    return NextResponse.json({ ok: true, mode, log });
  }

  // ── FULL RESET MODE ────────────────────────────────────────────
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: { id: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });

  // 1. Cancelar Stripe subs
  if (
    subscription?.stripeCustomerId &&
    !subscription.stripeCustomerId.startsWith("pending_")
  ) {
    try {
      const stripe = getStripeClient();
      const subs = await stripe.subscriptions.list({
        customer: subscription.stripeCustomerId,
        status: "all",
        limit: 100,
      });
      const cancellable = subs.data.filter((s) =>
        ["active", "trialing", "past_due", "incomplete"].includes(s.status),
      );
      log.push(
        `Stripe: ${subs.data.length} subs total, ${cancellable.length} to cancel.`,
      );
      for (const s of cancellable) {
        await stripe.subscriptions.cancel(s.id, { prorate: false });
        log.push(`  cancelled ${s.id} (${s.status})`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Stripe cancel failed: ${msg}`, log },
        { status: 500 },
      );
    }
  } else {
    log.push("No real Stripe customer — skipping Stripe cancel.");
  }

  // 2. Wipe work data scoped al org
  const candidateIds = (
    await prisma.candidate.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    })
  ).map((c) => c.id);
  const jobIds = (
    await prisma.job.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    })
  ).map((j) => j.id);

  await prisma.calendarEvent.deleteMany({ where: { organizationId: orgId } });

  const interviewIds = (
    await prisma.interview.findMany({
      where: { job: { organizationId: orgId } },
      select: { id: true },
    })
  ).map((i) => i.id);
  if (interviewIds.length) {
    await prisma.interviewFeedback.deleteMany({
      where: { interviewId: { in: interviewIds } },
    });
    await prisma.interviewClientContact.deleteMany({
      where: { interviewId: { in: interviewIds } },
    });
    await prisma.interviewAssignment.deleteMany({
      where: { interviewId: { in: interviewIds } },
    });
  }
  await prisma.interview.deleteMany({
    where: { job: { organizationId: orgId } },
  });

  await prisma.activity.deleteMany({ where: { organizationId: orgId } });
  if (candidateIds.length) {
    await prisma.document.deleteMany({
      where: { candidateId: { in: candidateIds } },
    });
    // CandidateRating no tiene candidateId directo (vive en submission).
    // Lo borra el cascade al deletear candidateSubmission mas abajo.
    await prisma.comment.deleteMany({
      where: { candidateId: { in: candidateIds } },
    });
  }
  if (jobIds.length) {
    await prisma.document.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.comment.deleteMany({ where: { jobId: { in: jobIds } } });
  }

  await prisma.placement.deleteMany({ where: { organizationId: orgId } });
  await prisma.candidateSubmission.deleteMany({
    where: { candidate: { organizationId: orgId } },
  });
  if (jobIds.length) {
    await prisma.pipelineStage.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobAssignment.deleteMany({
      where: { jobId: { in: jobIds } },
    });
  }
  await prisma.job.deleteMany({ where: { organizationId: orgId } });
  await prisma.candidate.deleteMany({ where: { organizationId: orgId } });

  log.push(`Wiped: ${candidateIds.length} candidates, ${jobIds.length} jobs.`);

  // 3. Wipe client data scoped al org. PendingFirmInvites no se
  // tocan — no estan scoped por organizationId (existen por email
  // antes que el firm las acepte) y son ruido limpio.
  await prisma.firmEngagement.deleteMany({ where: { organizationId: orgId } });

  const orgClients = await prisma.organizationClient.findMany({
    where: { organizationId: orgId },
    select: { clientId: true },
  });
  const clientIds = orgClients.map((oc) => oc.clientId);
  await prisma.organizationClient.deleteMany({
    where: { organizationId: orgId },
  });

  if (clientIds.length) {
    const orphanClients = await prisma.client.findMany({
      where: {
        id: { in: clientIds },
        engagedOrganizations: { none: {} },
      },
      select: { id: true },
    });
    const orphanIds = orphanClients.map((c) => c.id);
    if (orphanIds.length) {
      const clientJobIds = (
        await prisma.clientJob.findMany({
          where: { clientId: { in: orphanIds } },
          select: { id: true },
        })
      ).map((cj) => cj.id);
      if (clientJobIds.length) {
        await prisma.clientJobMember.deleteMany({
          where: { clientJobId: { in: clientJobIds } },
        });
        await prisma.clientPipelineStage.deleteMany({
          where: { clientJobId: { in: clientJobIds } },
        });
      }
      await prisma.clientJob.deleteMany({ where: { clientId: { in: orphanIds } } });
      await prisma.clientNotification.deleteMany({
        where: { clientId: { in: orphanIds } },
      });
      await prisma.clientPortalToken.deleteMany({
        where: { clientUser: { clientId: { in: orphanIds } } },
      });
      await prisma.clientUser.deleteMany({
        where: { clientId: { in: orphanIds } },
      });
      await prisma.contact.deleteMany({ where: { clientId: { in: orphanIds } } });
      await prisma.client.deleteMany({ where: { id: { in: orphanIds } } });
      log.push(`Wiped: ${orphanIds.length} orphan clients + cascade.`);
    }
  }

  await prisma.userInvite.deleteMany({ where: { organizationId: orgId } });

  // 4. Reset Subscription a fresh TRIAL
  const TRIAL_DAYS = 7;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.subscription.update({
    where: { organizationId: orgId },
    data: {
      status: "TRIALING",
      stripeSubscriptionId: null,
      trialEndsAt,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      seats: 1,
    },
  });
  log.push(`Subscription reset → TRIALING, ends ${trialEndsAt.toISOString()}.`);

  const teamSize = await prisma.user.count({
    where: { organizationId: orgId },
  });
  log.push(`Team intact: ${teamSize} users.`);

  return NextResponse.json({ ok: true, mode, log });
}
