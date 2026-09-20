import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateClientPortalToken } from "@/lib/tokens";
import { getClientContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenRecord = await validateClientPortalToken(token);

    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    // Esta ruta es anonima por diseno: el link llega por mail a alguien
    // que todavia no tiene cuenta, y el token ES la credencial. Por eso
    // NO se exige sesion.
    //
    // Pero si hay una sesion de portal y es de OTRA empresa, entonces
    // no estamos ante el destinatario del mail sino ante un ClientUser
    // usando un token que no le corresponde (los tokens se reenvian, y
    // POST /team se los muestra a cualquier miembro). Ahi cortamos:
    // antes de esto, un usuario del Cliente B leia el pipeline entero
    // del Cliente A.
    const ctx = await getClientContext().catch(() => null);
    if (ctx && ctx.clientId !== tokenRecord.clientId) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    const client = await prisma.client.findFirst({
      where: { id: tokenRecord.clientId },
      select: { name: true, id: true },
    });

    const jobWhere: any = {
      clientId: tokenRecord.clientId,
      submissions: { some: { isSharedWithClient: true } },
    };
    if (tokenRecord.jobId) jobWhere.id = tokenRecord.jobId;

    const jobs = await prisma.job.findMany({
      where: jobWhere,
      select: {
        id: true,
        title: true,
        status: true,
        location: true,
        salary: true,
        submissions: {
          where: { isSharedWithClient: true },
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                linkedIn: true,
                currentTitle: true,
                currentCompany: true,
                location: true,
                skills: true,
                summary: true,
                // Sin datos salariales: la landing promete "Salary info
                // auto-redacted" y la ruta autenticada del portal ya no
                // los manda. Esta era la unica que seguia filtrando
                // `desiredSalary` al cliente.
                documents: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    size: true,
                    createdAt: true,
                  },
                },
              },
            },
            // Documents que la agencia eligio compartir EN ESTE envio.
            // Mismo criterio que /api/client-portal/candidates/[id]:
            // sin esto se mandaban TODOS los documentos del candidato,
            // salteando la seleccion por envio.
            sharedDocuments: {
              include: {
                document: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    size: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: { addedAt: "desc" },
            },
            stage: { select: { name: true, color: true } },
            ratings: {
              select: {
                score: true,
                feedback: true,
                clientUser: { select: { name: true } },
              },
            },
            comments: {
              where: { type: "CLIENT_VISIBLE" },
              select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { name: true } },
                clientUser: { select: { name: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    // Dejar en `candidate.documents` solo lo que la agencia compartio
    // en este envio, y no exponer la tabla intermedia. Fallback a los
    // documentos del candidato cuando la submission no tiene ninguna
    // row de SubmissionDocument (shares viejos, previos a la feature),
    // igual que hace la ruta autenticada, para no romper historicos.
    const safeJobs = jobs.map((job) => ({
      ...job,
      submissions: job.submissions.map((submission) => {
        const { sharedDocuments, candidate, ...rest } = submission as typeof submission & {
          sharedDocuments: { document: unknown }[];
        };
        return {
          ...rest,
          candidate: {
            ...candidate,
            documents:
              sharedDocuments.length > 0
                ? sharedDocuments.map((sd) => sd.document)
                : candidate.documents,
          },
        };
      }),
    }));

    return NextResponse.json({ client, jobs: safeJobs, tokenId: tokenRecord.id });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
