// Single source of truth for "can this user act on this Job?".
//
// REGLA (decisión 2026-06-19 con Nicolás + Ari):
// - ADMIN del org → bypass total. Ve y muta cualquier job del org sin
//   necesidad de estar asignado. Razón: el admin es dueño del workspace
//   y en una agency real es esperado que pueda intervenir en cualquier
//   búsqueda (cubrir vacaciones, calidad, despidos, etc.).
// - USER del org → assignment-based estricto. Solo ve y muta jobs en
//   los que figura como JobAssignment. Sin bypass.
//
// Cómo se aplica: el caller le pasa el role (vía ctx.role de
// getOrgContext). Si NO se pasa, el default es "USER" — comportamiento
// conservador para call sites que aún no se actualizaron. Cualquier
// nuevo call site debería pasar el role explícito.
//
// Antes de esta decisión, la regla era "assignment-based para todos
// incluyendo ADMIN". Se invirtió porque generaba fricción operativa:
// el admin tenía que self-asignarse a jobs ajenos para poder
// intervenir y los flows quedaban raros.

import { prisma } from "@/lib/prisma";

export async function canAccessJob(
  jobId: string,
  organizationId: string,
  userId: string,
  role?: "ADMIN" | "USER",
): Promise<boolean> {
  // ADMIN: bypass — basta con que el job pertenezca al org del caller.
  if (role === "ADMIN") {
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId },
      select: { id: true },
    });
    return !!job;
  }

  // USER (o default): assignment-based estricto.
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      assignments: { where: { userId }, select: { userId: true } },
    },
  });
  if (!job) return false;
  return job.assignments.length > 0;
}
