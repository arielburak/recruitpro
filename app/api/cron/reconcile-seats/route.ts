import { NextResponse } from "next/server";
import { isAuthorizedCron, reconcileSeats } from "@/lib/cron-jobs";

// Endpoint individual para disparar el job a mano (debugging).
// El schedule real lo maneja /api/cron/daily. Ver lib/cron-jobs.ts.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await reconcileSeats();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
