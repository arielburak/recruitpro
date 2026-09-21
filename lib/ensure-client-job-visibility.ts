import { prisma } from "@/lib/prisma";

// Compartir un candidato con el cliente tiene que hacer que el cliente
// PUEDA VERLO. Suena obvio, pero no era lo que pasaba.
//
// La cadena de visibilidad del portal es
//   ClientJobMember → ClientJob → FirmEngagement(ACCEPTED) → Job
// (ver lib/client-job-access.ts). Esa cadena la armaba UNICAMENTE el
// flujo "Invite Client" hecho DESDE la busqueda. Si la agencia creaba
// la busqueda por su cuenta e invitaba al contacto desde su ficha
// (invite-portal, que devuelve grantedJobMembership:false), no existia
// ni el ClientJob espejo ni el FirmEngagement.
//
// Resultado, verificado en QA: el reclutador comparte el candidato, la
// agencia muestra "Shared", al cliente le llega la notificacion, hace
// click y lee "Candidate not found or not shared with you". El
// candidato quedaba invisible para siempre y nada en la UI decia que
// faltaba un segundo paso. Es el circuito central del producto.
//
// Este helper cierra esa brecha de forma idempotente. NO amplia el
// alcance mas alla del cliente dueño de la busqueda: el espejo se crea
// contra `job.clientId` y los miembros que se agregan son ClientUsers
// activos de ESE cliente. Un cliente distinto sigue sin ver nada.

export type ClientJobVisibilityResult =
  | { ok: true; clientJobId: string; membersGranted: number }
  | { ok: false; reason: "no_client" | "no_portal_users" };

export async function ensureClientJobVisibility(job: {
  id: string;
  clientId: string | null;
  organizationId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  salary?: string | null;
  currency?: string | null;
  status?: string | null;
  workMode?: string | null;
}): Promise<ClientJobVisibilityResult> {
  if (!job.clientId) return { ok: false, reason: "no_client" };

  // Los ClientUser activos del cliente. Hace falta al menos uno:
  // ClientJob.postedById es obligatorio y apunta a un ClientUser, asi
  // que sin nadie en el portal el espejo directamente no se puede
  // crear. En ese caso devolvemos `no_portal_users` para que el caller
  // se lo pueda decir al reclutador en vez de fallar callado.
  const portalUsers = await prisma.clientUser.findMany({
    where: { clientId: job.clientId, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (portalUsers.length === 0) return { ok: false, reason: "no_portal_users" };

  // 1. Espejo. `sourceJobId` es @unique, asi que hay a lo sumo uno por
  //    busqueda de la agencia.
  const existing = await prisma.clientJob.findUnique({
    where: { sourceJobId: job.id },
    select: { id: true },
  });

  const clientJobId =
    existing?.id ??
    (
      await prisma.clientJob.create({
        data: {
          title: job.title,
          description: job.description ?? null,
          location: job.location ?? null,
          salaryRange: job.salary ?? null,
          salaryCurrency: job.currency || "USD",
          isRemote: job.workMode ? job.workMode !== "ON_SITE" : false,
          status: job.status || "OPEN",
          clientId: job.clientId,
          postedById: portalUsers[0].id,
          // La busqueda la abrio la agencia, no el cliente. El portal
          // usa esto para no etiquetarla como "Posted by you".
          createdByAgency: true,
          sourceJobId: job.id,
        },
        select: { id: true },
      })
    ).id;

  // 2. Engagement ACCEPTED que une el espejo con la busqueda real.
  //    Sin `jobId` y sin ACCEPTED, accessibleAgencyJobIds lo descarta.
  const engagement = await prisma.firmEngagement.findFirst({
    where: { clientJobId, organizationId: job.organizationId },
    select: { id: true, status: true, jobId: true },
  });
  if (!engagement) {
    await prisma.firmEngagement.create({
      data: {
        clientJobId,
        organizationId: job.organizationId,
        jobId: job.id,
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
    });
  } else if (engagement.status !== "ACCEPTED" || engagement.jobId !== job.id) {
    await prisma.firmEngagement.update({
      where: { id: engagement.id },
      data: { jobId: job.id, status: "ACCEPTED", respondedAt: new Date() },
    });
  }

  // 3. Membresia por persona. El reclutador comparte con la EMPRESA,
  //    asi que los usuarios de portal de ese cliente quedan habilitados
  //    para esta busqueda. Idempotente.
  let membersGranted = 0;
  for (const u of portalUsers) {
    const res = await prisma.clientJobMember.upsert({
      where: { clientJobId_clientUserId: { clientJobId, clientUserId: u.id } },
      update: {},
      create: { clientJobId, clientUserId: u.id },
      select: { id: true },
    });
    if (res) membersGranted++;
  }

  return { ok: true, clientJobId, membersGranted };
}
