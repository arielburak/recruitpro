import { NextResponse } from "next/server";
import { expireTrials, isAuthorizedCron } from "@/lib/cron-jobs";

// Endpoint individual para disparar el job a mano (debugging).
//
// El schedule real lo maneja /api/cron/daily, que corre este job junto
// con los otros dos bajo un único cron de Vercel. La lógica vive en
// lib/cron-jobs.ts — acá solo queda el wrapper HTTP.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await expireTrials();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
