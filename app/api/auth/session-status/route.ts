import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

// Endpoint liviano para que el client poll el estado de su session.
// Devuelve { active: bool } sin más data — el client SessionGate
// usa esto para detectar deactivation mid-session y mostrar overlay
// bloqueante. Sin esto el user deactivated mientras tenía sesión
// abierta podía seguir navegando hasta que algún server-side render
// o fetch crítico fallara — UI rota sin mensaje claro.
//
// CRÍTICO (audit 2026-06-26): este endpoint sirve a DOS tipos de user
// que viven en tablas distintas. session.user.id es User.id para el
// staffing y ClientUser.id para el portal del cliente — son cuids de
// tablas separadas y no se cruzan. Buscar siempre en `User` hacía que
// TODO client user diera not-found → active:false → el SessionGate
// (montado en client-portal/layout.tsx) tapaba el portal entero con
// "Your access has been revoked". Ahora ruteamos por el flag
// isClientUser y, por las dudas el flag falte en alguna sesión vieja,
// caemos a la otra tabla antes de declarar deactivation.
//
// no-cache obligatorio para que el polling traiga estado fresh
// siempre.

export const dynamic = "force-dynamic";

const ok = (body: Record<string, unknown>) =>
  NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const su = session?.user as any;
    const userId = su?.id as string | undefined;

    if (!userId) return ok({ active: false, reason: "no_session" });

    const isClientUser = su?.isClientUser === true;

    // Tabla esperada según el tipo de sesión.
    const lookupStaffing = () =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { isActive: true },
      });
    const lookupClient = () =>
      prisma.clientUser.findUnique({
        where: { id: userId },
        select: { isActive: true },
      });

    let row = isClientUser ? await lookupClient() : await lookupStaffing();

    // Fallback cruzado: si el flag no coincide con dónde vive el row
    // (sesión emitida antes de que existiera el flag, por ejemplo),
    // preferimos chequear la otra tabla antes que lockear a alguien
    // que sí está activo.
    if (!row) {
      row = isClientUser ? await lookupStaffing() : await lookupClient();
    }

    if (!row || !row.isActive) {
      return ok({ active: false, reason: "deactivated" });
    }

    return ok({ active: true });
  } catch {
    // En cualquier error inesperado devolvemos active: true para no
    // bloquear al user incorrectamente. Si hay un problema de DB
    // real, otros endpoints van a fallar y el flow normal lo va a
    // detectar.
    return ok({ active: true });
  }
}
