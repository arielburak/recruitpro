import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

// Agency-side autocomplete for the "Invite Client to Portal" dialog on
// a Job page. Busca dos cosas en paralelo y las junta:
//
//  1) ClientUsers existentes (portal users con login). El mail-uniqueness
//     rule (one email = one Client) significa:
//     - matches en THIS Client → pickable (recruiter re-invita a alguien
//       ya activado);
//     - matches en OTRO Client → disabled con "in use at X" para que el
//       recruiter sepa que el mail esta tomado y use otro.
//
//  2) Contacts cargados en /clients/[id]/contacts del Client actual que
//     todavia NO tienen portal access. Estos son hiring contacts que el
//     recruiter agrego como meta-info y nunca invito. Pickearlos
//     pre-llena el form para que la primer invite cree el ClientUser
//     en flow. Solo del Client actual: Contacts de otros clientes no
//     tienen sentido aca y crearian ruido.
//
// Scope: solo Clients de esta agencia. Rosters de otras agencias
// quedan privados.
export async function GET(request: Request) {
  try {
    const ctx = await getOrgContext();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const currentClientId = (url.searchParams.get("currentClientId") || "").trim();

    if (q.length < 2) return NextResponse.json([]);

    const [users, contacts] = await Promise.all([
      prisma.clientUser.findMany({
        where: {
          isActive: true,
          client: {
            engagedOrganizations: { some: { organizationId: ctx.organizationId } },
          },
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          title: true,
          passwordHash: true,
          clientId: true,
          client: { select: { name: true } },
        },
        orderBy: [{ name: "asc" }],
        take: 12,
      }),
      // Solo buscamos Contacts cuando sabemos a que Client estamos
      // invitando. Sin currentClientId el match seria globalish y no
      // sabriamos a quien linkearlos cuando se mande la invite.
      currentClientId
        ? prisma.contact.findMany({
            where: {
              clientId: currentClientId,
              email: { not: null },
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              title: true,
              clientId: true,
              client: { select: { name: true } },
            },
            orderBy: [{ firstName: "asc" }],
            take: 12,
          })
        : Promise.resolve([]),
    ]);

    // Mails ya cubiertos por la lista de ClientUsers; si el Contact
    // tiene el mismo mail que un ClientUser activo, no lo duplicamos.
    const userEmails = new Set(users.map((u) => u.email.toLowerCase()));

    const userResults = users.map((m) => {
      const onCurrentClient = currentClientId
        ? m.clientId === currentClientId
        : false;
      return {
        id: m.id,
        email: m.email,
        name: m.name,
        title: m.title,
        clientId: m.clientId,
        clientName: m.client.name,
        hasPassword: !!m.passwordHash,
        onCurrentClient,
        source: "clientUser" as const,
        // Picking a contact at a different Client would fail server-side
        // (the unique-email rule rejects cross-Client invites). Surface
        // that as `available: false` so the UI can disable the row and
        // explain why instead of letting the recruiter submit and get
        // a 409.
        available: onCurrentClient || !currentClientId,
      };
    });

    const contactResults = contacts
      .filter((c) => c.email && !userEmails.has(c.email.toLowerCase()))
      .map((c) => ({
        id: `contact:${c.id}`,
        email: c.email as string,
        name: `${c.firstName} ${c.lastName}`.trim() || (c.email as string),
        title: c.title,
        clientId: c.clientId,
        clientName: c.client.name,
        // No portal user todavia — el invite lo crea cuando se manda.
        hasPassword: false,
        onCurrentClient: true,
        source: "contact" as const,
        available: true,
      }));

    return NextResponse.json([...userResults, ...contactResults]);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
