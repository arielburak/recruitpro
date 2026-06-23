import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";

// Daily cleanup del log de eventos de Stripe usado para idempotency.
//
// Stripe retiene un event y reintenta delivery por 3 días si no hay 2xx.
// Cualquier row más viejo que eso ya no sirve para dedup (Stripe no va
// a reintentar el mismo eventId después de 3 días). Mantenemos un buffer
// generoso de 14 días por si hay ventanas raras de retención del lado
// de Stripe.
//
// Sin este cleanup el WebhookEvent crece indefinido — el schema tiene
// un index en processedAt pero el costo de almacenamiento + tiempo de
// vacuum crecen para nada. Audit 2026-06-23.

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 14;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await prisma.webhookEvent.deleteMany({
      where: { processedAt: { lt: cutoff } },
    });
    return NextResponse.json({
      processedAt: new Date().toISOString(),
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    });
  } catch (error: any) {
    console.error("[cron cleanup-webhook-events] failed:", error);
    Sentry.captureException(error, {
      tags: { area: "cron", job: "cleanup-webhook-events" },
    });
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
