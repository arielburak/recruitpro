import { NextResponse } from "next/server";
import {
  cleanupWebhookEvents,
  expireTrials,
  isAuthorizedCron,
  reconcileSeats,
  type JobResult,
} from "@/lib/cron-jobs";

// Único cron job del proyecto: corre los tres jobs diarios en secuencia.
//
// Antes había 3 entradas en vercel.json, pero el plan Hobby limita la
// cantidad de crons, así que al menos uno nunca se ejecutaba. Si el que
// caía era expire-trials, los trials vencidos seguían dando acceso
// gratis indefinidamente. Consolidar en uno solo funciona en cualquier
// plan y saca el límite de la ecuación.
//
// Orden deliberado:
//   1. expire-trials      — el que toca acceso de usuarios, primero
//   2. reconcile-seats    — toca facturación, necesita Stripe up
//   3. cleanup-webhook-events — housekeeping, el más descartable
//
// Cada job atrapa sus propias excepciones (ver lib/cron-jobs), así que
// uno que falle no frena a los siguientes. La respuesta devuelve el
// detalle de los tres para poder leer los logs de Vercel de un vistazo.
//
// Auth: Bearer ${CRON_SECRET}, igual que los endpoints individuales.

export const dynamic = "force-dynamic";

// Los tres jobs iteran sobre orgs llamando a Stripe. Con pocas orgs
// termina en segundos, pero el default de 10s de Vercel queda corto
// apenas crezca. 60s es el techo del plan Hobby.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const results: JobResult[] = [];

  results.push(await expireTrials());
  results.push(await reconcileSeats());
  results.push(await cleanupWebhookEvents());

  const failed = results.filter((r) => !r.ok);

  // 500 si TODOS fallaron: eso es infra caída y queremos que Vercel lo
  // marque como run fallido. Si falló solo alguno, respondemos 200 con
  // el detalle — el error ya fue a Sentry y no queremos que Vercel
  // reintente los jobs que sí funcionaron.
  const allFailed = failed.length === results.length;

  return NextResponse.json(
    {
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      ok: failed.length === 0,
      failed: failed.map((r) => r.job),
      results,
    },
    { status: allFailed ? 500 : 200 },
  );
}
