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
// no-cache obligatorio para que el polling traiga estado fresh
// siempre.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;

    if (!userId) {
      return NextResponse.json(
        { active: false, reason: "no_session" },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { active: false, reason: "deactivated" },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { active: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    // En cualquier error inesperado devolvemos active: true para no
    // bloquear al user incorrectamente. Si hay un problema de DB
    // real, otros endpoints van a fallar y el flow normal lo va a
    // detectar.
    return NextResponse.json(
      { active: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
