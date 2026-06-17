import { NextResponse } from "next/server";

// Smoke-test endpoint para verificar que Sentry está recibiendo
// errores end-to-end. Tira una excepción a propósito → Sentry la
// captura via instrumentation.ts → aparece en Issues.
//
// Visitalo una sola vez en staging después del redeploy con las env
// vars de Sentry cargadas. Eliminá este file en el próximo commit.
//
// Sin auth a propósito: es un health-check público y solo tira un
// throw — no expone data ni muta nada.
export async function GET() {
  throw new Error(
    "Sentry smoke test — if you see this in Sentry → Issues, integration works. Delete this endpoint after confirming."
  );
  // El return queda inalcanzable pero TypeScript lo quiere.
  return NextResponse.json({ ok: true });
}
