// Wrapper sobre getOrgContext que ADEMÁS valida que el org tenga una
// subscription activa (ACTIVE, TRIALING válido, o isComp=true).
//
// Por qué wrapper en vez de modificar getOrgContext: el contrato del
// helper base lo usan ~80 endpoints. Cambiar su shape sería arriesgado.
// Este wrapper le sirve solo a los endpoints que crean / mutan data
// del producto (candidates, jobs, submissions, interviews, placements,
// clients, contacts, invites de team) — el resto sigue usando el helper
// histórico sin breaking change.
//
// Endpoints que NO usan este guard:
//   · Cualquier GET (lectura siempre disponible, queremos que el user
//     vea su data aunque haya vencido el trial — y el banner "subscribe
//     to continue" funciona contra la data visible).
//   · /api/admin/billing/* — son los endpoints que el user usa
//     justamente para reactivar.
//   · /api/auth/* — login, signup, password reset, verify email.
//   · /api/profile — el user puede editar su perfil siempre.
//   · /api/engagements/[id] accept/decline — son flujos que pueden
//     llevar al user a billing.
//
// Cuando el guard falla, throwea SubscriptionError. El endpoint debería
// catchear y devolver 402 (Payment Required) con el mensaje. El frontend
// puede interceptar 402 globalmente y mostrar un modal con link a
// /settings/billing.

import { getOrgContext } from "@/lib/tenant";
import { requireActiveSubscription, SubscriptionError } from "@/lib/subscription-guard";
import { NextResponse } from "next/server";

export { SubscriptionError };

export async function getOrgContextWithActiveSub() {
  const ctx = await getOrgContext();
  await requireActiveSubscription(ctx.organizationId);
  return ctx;
}

// Helper para el error handling en endpoints. Si el catch atrapa una
// SubscriptionError, devolver 402 con el mensaje. Cualquier otra cosa
// re-tira para que el caller la maneje.
export function subscriptionErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof SubscriptionError) {
    return NextResponse.json(
      { error: error.message, code: "subscription_required" },
      { status: 402 },
    );
  }
  return null;
}
