/**
 * Reset un account de testing para volver a probar el flow de billing
 * end-to-end sin tener que crear cuenta nueva.
 *
 * Lo que hace:
 *   1. Encuentra el User por email + su Organization.
 *   2. Cancela TODAS las Stripe subscriptions de ese customer (un user
 *      puede haber acumulado N por bugs de doble-checkout) — usa
 *      cancel inmediato (`prorate=false`) porque están en trial.
 *   3. Borra todo el work data del org (candidates, jobs, submissions,
 *      placements, interviews, comments, documents, activities,
 *      pipeline stages, calendar events, attachments, etc).
 *   4. Borra los client-related rows scoped al org (clients,
 *      contacts, organizationClient pivot, firm engagements, pending
 *      invites, etc).
 *   5. Resetea la Subscription row a TRIAL fresh:
 *        · status = TRIALING
 *        · stripeSubscriptionId = null
 *        · trialEndsAt = now + 7 days
 *        · cancelAtPeriodEnd = false
 *        · currentPeriodEnd = null
 *        · seats = 1
 *        · isComp queda como esta
 *   6. KEEPS: los User rows del org (team members), Organization,
 *      Account (NextAuth OAuth links), UserIntegration, UserNotification.
 *
 * Por que no usar wipe-tenant-data: ese script no esta scoped por
 * organizationId y wipea TODA la DB. Para un account de testing
 * especifico en una DB compartida con otros tenants, este es safer.
 *
 * Usage (via GitHub Actions workflow `admin-script`):
 *   script: reset-billing-test-account
 *   args:   cuello.nico@gmail.com
 *   env:    staging  (NUNCA production sin doble confirmacion)
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const mode = process.argv[3]?.trim().toLowerCase() || "reset";
  if (!email) {
    console.error("Usage: reset-billing-test-account <email> [mode]");
    console.error("Modes:");
    console.error("  reset   (default) — wipe data + cancel Stripe subs + reset to fresh TRIAL");
    console.error("  expire  — solo setea trialEndsAt en el pasado (no wipea nada)");
    process.exit(1);
  }
  if (mode !== "reset" && mode !== "expire") {
    console.error(`Unknown mode "${mode}". Use "reset" or "expire".`);
    process.exit(1);
  }

  console.log("================================================");
  console.log(" Reset billing test account");
  console.log("================================================");
  console.log(` Email: ${email}`);
  console.log(` Mode:  ${mode}`);
  console.log(` DB:    ${maskDbHost(process.env.DATABASE_URL)}`);
  console.log("");

  const { prisma } = await import("../lib/prisma");

  // 1. Resolver user + org -----------------------------------------
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      name: true,
      organizationId: true,
      organization: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    console.error(`No user found for email "${email}". Bailing out.`);
    process.exit(1);
  }

  const orgId = user.organizationId;
  console.log(`Found user: ${user.name} (${user.email})`);
  console.log(`Org: ${user.organization.name} (${orgId})`);
  console.log("");

  // Modo EXPIRE: backdate trialEndsAt local + si hay Stripe sub
  // trialing, también pedirle a Stripe que termine el trial AHORA
  // (trial_end: 'now'). Stripe va a:
  //   · cobrar la tarjeta de prueba → invoice.paid → webhook
  //     customer.subscription.updated con status=active → DB pasa a
  //     ACTIVE → el usuario sigue accediendo normalmente.
  //   · O fallar el cobro → past_due → webhook → DB pasa a PAST_DUE
  //     (3-day grace).
  //
  // Sin la parte de Stripe el backdate local solo, contra una sub
  // que tiene card on file en Stripe, deja al user falsamente
  // bloqueado: el guard ve trialEndsAt vencido y tira "Trial expired"
  // aunque Stripe pudiera haber cobrado sin drama.
  if (mode === "expire") {
    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // ayer
    const subRow = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
      select: { stripeSubscriptionId: true },
    });

    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: { trialEndsAt: expiredAt },
    });
    console.log(`Subscription.trialEndsAt backdateado a ${expiredAt.toISOString()}.`);

    if (subRow?.stripeSubscriptionId) {
      try {
        const { getStripeClient } = await import("../lib/stripe");
        const stripe = getStripeClient();
        const stripeSub = await stripe.subscriptions.retrieve(subRow.stripeSubscriptionId);
        if (stripeSub.status === "trialing") {
          await stripe.subscriptions.update(subRow.stripeSubscriptionId, {
            trial_end: "now",
          });
          console.log(`Stripe: trial_end='now' enviado a ${subRow.stripeSubscriptionId}.`);
          console.log("Stripe va a cobrar la tarjeta y disparar el webhook subscription.updated.");
          console.log("Esperá ~10s y refrescá /settings/billing — deberías ver ACTIVE.");
        } else {
          console.log(`Stripe sub ${subRow.stripeSubscriptionId} no está en trialing (status=${stripeSub.status}). Skipping trial_end.`);
        }
      } catch (e: any) {
        console.error(`Stripe trial_end failed: ${e?.message || e}`);
        console.error("La DB local quedó con trial vencido. Si tenías card on file, vas a ver el banner 'Trial expired' por error. Investigá Stripe state manualmente.");
      }
    } else {
      console.log("No hay Stripe sub asociada — solo backdate local.");
      console.log("Refrescá /settings/billing — deberías ver el banner rojo 'Trial expired'.");
    }

    await prisma.$disconnect();
    return;
  }

  // Sanity: contar team antes para confirmar que NO los tocamos.
  const teamBefore = await prisma.user.count({
    where: { organizationId: orgId },
  });
  console.log(`Team members in org (to be kept): ${teamBefore}`);
  console.log("");

  // 2. Cancelar Stripe subs ----------------------------------------
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: orgId },
    select: { id: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });

  if (subscription?.stripeCustomerId && !subscription.stripeCustomerId.startsWith("pending_")) {
    console.log(`Stripe customer: ${subscription.stripeCustomerId}`);
    try {
      const { getStripeClient } = await import("../lib/stripe");
      const stripe = getStripeClient();
      // Listar TODAS las subs del customer (active + trialing + past_due).
      // No usamos solo el stripeSubscriptionId guardado porque por el bug
      // de doble-checkout pueden quedar varias en paralelo.
      const subs = await stripe.subscriptions.list({
        customer: subscription.stripeCustomerId,
        status: "all",
        limit: 100,
      });
      const cancellable = subs.data.filter((s) =>
        ["active", "trialing", "past_due", "incomplete"].includes(s.status),
      );
      console.log(`Found ${subs.data.length} subs total; ${cancellable.length} to cancel.`);
      for (const s of cancellable) {
        console.log(`  Cancelling ${s.id} (status=${s.status})...`);
        await stripe.subscriptions.cancel(s.id, { prorate: false });
      }
    } catch (e: any) {
      console.error(`Stripe cancel step failed: ${e?.message || e}`);
      console.error("Aborting BEFORE touching DB so we don't end up with orphaned Stripe subs.");
      process.exit(1);
    }
  } else {
    console.log("No real Stripe customer on file — skipping Stripe cancel step.");
  }
  console.log("");

  // 3. Wipe work data scoped al org -------------------------------
  console.log("Wiping work data...");
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

  // Calendar events del org (referencias a job/candidate/client via SetNull).
  await prisma.calendarEvent.deleteMany({ where: { organizationId: orgId } });

  // Interview-related: chained delete via interview.jobId.
  const interviewIds = (
    await prisma.interview.findMany({
      where: { job: { organizationId: orgId } },
      select: { id: true },
    })
  ).map((i) => i.id);
  if (interviewIds.length) {
    await prisma.interviewFeedback.deleteMany({ where: { interviewId: { in: interviewIds } } });
    await prisma.interviewClientContact.deleteMany({ where: { interviewId: { in: interviewIds } } });
    await prisma.interviewAssignment.deleteMany({ where: { interviewId: { in: interviewIds } } });
  }
  await prisma.interview.deleteMany({ where: { job: { organizationId: orgId } } });

  // Activity / document / comment / rating
  await prisma.activity.deleteMany({ where: { organizationId: orgId } });
  await prisma.document.deleteMany({
    where: {
      OR: [
        { candidateId: candidateIds.length ? { in: candidateIds } : undefined },
        { jobId: jobIds.length ? { in: jobIds } : undefined },
      ].filter((c) => Object.values(c).some((v) => v !== undefined)),
    },
  });
  if (candidateIds.length) {
    await prisma.candidateRating.deleteMany({ where: { candidateId: { in: candidateIds } } });
    await prisma.comment.deleteMany({ where: { candidateId: { in: candidateIds } } });
  }
  if (jobIds.length) {
    await prisma.comment.deleteMany({ where: { jobId: { in: jobIds } } });
  }

  await prisma.placement.deleteMany({ where: { organizationId: orgId } });
  await prisma.candidateSubmission.deleteMany({
    where: { candidate: { organizationId: orgId } },
  });
  if (jobIds.length) {
    await prisma.pipelineStage.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } });
  }
  await prisma.job.deleteMany({ where: { organizationId: orgId } });
  await prisma.candidate.deleteMany({ where: { organizationId: orgId } });

  // 4. Wipe client-related rows scoped al org ---------------------
  console.log("Wiping client data...");
  await prisma.pendingFirmInvite.deleteMany({ where: { organizationId: orgId } });
  await prisma.firmEngagement.deleteMany({ where: { organizationId: orgId } });

  // Para clients hay que ir por OrganizationClient (multi-firm pivot)
  // y borrar solo los clients que SOLO pertenecen a esta org.
  const orgClients = await prisma.organizationClient.findMany({
    where: { organizationId: orgId },
    select: { clientId: true },
  });
  const clientIds = orgClients.map((oc) => oc.clientId);
  await prisma.organizationClient.deleteMany({ where: { organizationId: orgId } });

  // De los clients que perdimos pivot con este org, borrar los que
  // ya no tienen otros pivots (huerfanos).
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
      // Cascade manual: contacts, clientUsers, clientJobs, etc.
      const clientJobIds = (
        await prisma.clientJob.findMany({
          where: { clientId: { in: orphanIds } },
          select: { id: true },
        })
      ).map((cj) => cj.id);
      if (clientJobIds.length) {
        await prisma.clientJobMember.deleteMany({ where: { clientJobId: { in: clientJobIds } } });
        await prisma.clientPipelineStage.deleteMany({ where: { clientJobId: { in: clientJobIds } } });
      }
      await prisma.clientJob.deleteMany({ where: { clientId: { in: orphanIds } } });
      await prisma.clientNotification.deleteMany({ where: { clientId: { in: orphanIds } } });
      await prisma.clientPortalToken.deleteMany({ where: { clientUser: { clientId: { in: orphanIds } } } });
      await prisma.clientUser.deleteMany({ where: { clientId: { in: orphanIds } } });
      await prisma.contact.deleteMany({ where: { clientId: { in: orphanIds } } });
      await prisma.client.deleteMany({ where: { id: { in: orphanIds } } });
    }
  }

  // UserInvites del org (invites pending)
  await prisma.userInvite.deleteMany({ where: { organizationId: orgId } });

  // 5. Reset Subscription row -------------------------------------
  console.log("Resetting Subscription to fresh TRIAL...");
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

  // 6. Confirm team intact ----------------------------------------
  const teamAfter = await prisma.user.count({
    where: { organizationId: orgId },
  });
  console.log("");
  console.log(`Team members after: ${teamAfter} (was ${teamBefore})`);
  if (teamAfter !== teamBefore) {
    console.error("WARNING: team member count changed! Investigate.");
  }
  console.log("");
  console.log("Done. Account reset to fresh TRIAL state.");
  console.log(`Trial ends: ${trialEndsAt.toISOString()}`);
  console.log("");
  console.log("Next: have the user re-test the subscribe flow from /settings/billing.");

  await prisma.$disconnect();
}

function maskDbHost(url: string | undefined) {
  if (!url) return "(none)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
