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

type Mode = "reset" | "expire" | "end-subscription";

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
  const mode: Mode =
    body?.mode === "expire"
      ? "expire"
      : body?.mode === "end-subscription"
        ? "end-subscription"
        : "reset";

  const orgId = ctx.organizationId;
  const log: string[] = [];

  // ── END-SUBSCRIPTION MODE ──────────────────────────────────────
  // Simula el final del período de una sub ACTIVE/cancelada-scheduled:
  // cancela inmediato en Stripe + marca CANCELED en DB + limpia
  // stripeSubscriptionId. Equivalente al outcome del webhook
  // customer.subscription.deleted que normalmente llega cuando termina
  // el período (Jul 24 en tu caso). Sin tener que esperar la fecha real.
  if (mode === "end-subscription") {
    const subRow = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
      select: { stripeSubscriptionId: true, stripeCustomerId: true },
    });

    if (subRow?.stripeSubscriptionId) {
      try {
        const stripe = getStripeClient();
        await stripe.subscriptions.cancel(subRow.stripeSubscriptionId, {
          prorate: false,
        });
        log.push(`Stripe sub ${subRow.stripeSubscriptionId} cancelled inmediato.`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log.push(`Stripe cancel failed (continuing anyway): ${msg}`);
      }
    } else {
      log.push("No Stripe sub atacheada — solo marcamos CANCELED en DB.");
    }

    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        status: "CANCELED",
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
      },
    });
    log.push("DB: status=CANCELED, stripeSubscriptionId=null.");

    return NextResponse.json({ ok: true, mode, log });
  }

  // ── EXPIRE MODE ────────────────────────────────────────────────
  // Backdate trialEndsAt local + si hay Stripe sub en trialing,
  // también pedirle a Stripe que termine el trial AHORA (trial_end:
  // 'now') así Stripe cobra la card y dispara el webhook que pasa la
  // sub a ACTIVE. Sin la parte de Stripe, una sub con card on file
  // queda falsamente bloqueada por el guard (que solo mira el campo
  // local trialEndsAt).
  if (mode === "expire") {
    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const subRow = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
      select: { stripeSubscriptionId: true },
    });

    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: { trialEndsAt: expiredAt },
    });
    log.push(`Subscription.trialEndsAt backdateado a ${expiredAt.toISOString()}.`);

    if (subRow?.stripeSubscriptionId) {
      try {
        const stripe = getStripeClient();
        const stripeSub = await stripe.subscriptions.retrieve(
          subRow.stripeSubscriptionId,
        );
        if (stripeSub.status === "trialing") {
          await stripe.subscriptions.update(subRow.stripeSubscriptionId, {
            trial_end: "now",
          });
          log.push(
            `Stripe: trial_end='now' enviado a ${subRow.stripeSubscriptionId}. Webhook va a actualizar status.`,
          );
        } else {
          log.push(
            `Stripe sub ${subRow.stripeSubscriptionId} no está en trialing (status=${stripeSub.status}). Skipping trial_end.`,
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log.push(`Stripe trial_end failed: ${msg}`);
      }
    } else {
      log.push("No hay Stripe sub asociada — solo backdate local.");
    }

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
      }
      // ClientPipelineStage cascade-deletea desde Client (Cascade en
      // la relation), asi que se limpia al borrar el orphan client.
      await prisma.clientJob.deleteMany({ where: { clientId: { in: orphanIds } } });
      await prisma.clientNotification.deleteMany({
        where: { clientId: { in: orphanIds } },
      });
      // ClientPortalToken referencia clientId directo (no via clientUser).
      await prisma.clientPortalToken.deleteMany({
        where: { clientId: { in: orphanIds } },
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
