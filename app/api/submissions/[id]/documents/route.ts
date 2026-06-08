import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Documents que la agencia eligio compartir con el cliente para esta
// submission especifica.
//
// GET: devuelve TODOS los docs del Candidate + flag `isShared` por
// cada uno (true si esta en SubmissionDocument). El dialog de share y
// el panel de edit post-share consumen este endpoint para mostrar la
// lista con checkboxes.
//
// PUT: reemplaza el set de docs compartidos para esta submission.
// Body: { documentIds: string[] }. Si el array esta vacio, el cliente
// deja de ver cualquier doc en esta submission. Es destructivo on
// purpose — el caller siempre manda la lista FINAL deseada, no un
// diff (mas simple, sin race conditions).

async function loadSubmission(id: string, organizationId: string) {
  return prisma.candidateSubmission.findFirst({
    where: { id, job: { organizationId } },
    select: {
      id: true,
      candidateId: true,
      candidate: {
        select: {
          documents: {
            select: {
              id: true,
              name: true,
              type: true,
              size: true,
              category: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      sharedDocuments: {
        select: { documentId: true },
      },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const submission = await loadSubmission(id, ctx.organizationId);
    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const sharedIds = new Set<string>(
      submission.sharedDocuments.map((s) => s.documentId),
    );
    const documents = submission.candidate.documents.map((d) => ({
      ...d,
      isShared: sharedIds.has(d.id),
    }));
    return NextResponse.json({ documents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const body = await request.json();
    const documentIds: string[] = Array.isArray(body.documentIds)
      ? body.documentIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    const submission = await loadSubmission(id, ctx.organizationId);
    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Solo aceptar doc ids que pertenezcan al mismo candidate. Si el
    // caller mete un doc id ajeno, lo descartamos silenciosamente —
    // no es necesariamente un ataque pero no queremos exponer ese
    // vector.
    const validIds = new Set<string>(
      submission.candidate.documents.map((d) => d.id),
    );
    const wantedIds = documentIds.filter((x) => validIds.has(x));

    const currentIds = new Set<string>(
      submission.sharedDocuments.map((s) => s.documentId),
    );
    const wanted = new Set<string>(wantedIds);
    const toAdd = wantedIds.filter((x) => !currentIds.has(x));
    const toRemove = Array.from(currentIds).filter((x) => !wanted.has(x));

    // Diff explicito en vez de deleteMany-then-createMany. Asi no
    // tiramos abajo metadata (addedBy/addedAt) de docs que ya
    // estaban shared.
    await prisma.$transaction([
      ...(toRemove.length > 0
        ? [
            prisma.submissionDocument.deleteMany({
              where: { submissionId: id, documentId: { in: toRemove } },
            }),
          ]
        : []),
      ...(toAdd.length > 0
        ? [
            prisma.submissionDocument.createMany({
              data: toAdd.map((documentId) => ({
                submissionId: id,
                documentId,
                addedById: ctx.userId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return NextResponse.json({ success: true, count: wantedIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
