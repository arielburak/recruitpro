import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

// Search users for @mention autocomplete in the client portal.
// scope=internal → only ClientUser of the caller's client
// scope=shared   → ClientUser of the client + staffing Users from firms with an engagement on this submission's job
//
// Optional filters:
//   ?submissionId=xxx — required for shared scope to scope staffing users.
//   ?clientJobId=xxx  — narrows the client-user results to people with
//     access to this Job (per ClientJobMember + admin bypass). Used by
//     the ClientJob Notes chat so you can't @ someone who can't even
//     see the search.
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const params = request.nextUrl.searchParams;
    const scope = params.get("scope") === "shared" ? "shared" : "internal";
    const q = (params.get("q") || "").trim();
    const submissionId = params.get("submissionId") || "";
    const clientJobId = params.get("clientJobId") || "";
    // Optional: when the ClientJob has multiple accepted engagements,
    // the chat tab the user is on knows which agency-side Job is the
    // target. Passing it here scopes the staffing-side mentions to
    // that firm's assignees only.
    const agencyJobIdParam = params.get("agencyJobId") || "";

    const results: Array<{ id: string; name: string; email: string; kind: "client" | "staffing"; title?: string | null }> = [];

    // Job-access filter for the per-Job mention case. Stricter than
    // view access on purpose: view defaults to "whole team" when no
    // members are listed (legacy mode), but @-mentions need to ping
    // someone deliberately, so we only allow people the user has
    // actively put on the search — the CREATOR plus anyone in the
    // explicit members list. No ADMIN bypass: management role
    // doesn't auto-grant search-level access (see lib/client-job-access).
    let jobMemberIds: Set<string> | null = null;
    if (clientJobId) {
      const job = await prisma.clientJob.findFirst({
        where: { id: clientJobId, clientId: ctx.clientId },
        include: { members: { select: { clientUserId: true } } },
      });
      if (!job) {
        return NextResponse.json([]);
      }
      jobMemberIds = new Set<string>([
        job.postedById,
        ...job.members.map((m) => m.clientUserId),
      ]);
    }

    // Client team members always available
    const clientUsers = await prisma.clientUser.findMany({
      where: {
        clientId: ctx.clientId,
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        // Exclude the current user
        NOT: { id: ctx.clientUserId },
      },
      select: { id: true, name: true, email: true, title: true, role: true },
      take: 16,
      orderBy: { name: "asc" },
    });

    for (const u of clientUsers) {
      // Per-Job filter — only the creator and explicitly added
      // members can be mentioned. No ADMIN bypass on purpose.
      if (jobMemberIds && !jobMemberIds.has(u.id)) {
        continue;
      }
      results.push({ id: u.id, name: u.name, email: u.email, title: u.title, kind: "client" });
      if (results.length >= 8) break;
    }

    if (scope === "shared") {
      // The "Shared with agency" chat needs to surface recruiters
      // working on this search alongside the client team. Two
      // resolution paths depending on what context the caller has:
      //
      //   · submissionId → from a candidate/submission chat: read
      //     the submission's job to know which agency org owns it.
      //   · clientJobId  → from a ClientJob notes chat: walk the
      //     accepted FirmEngagement to find the agency org + Job,
      //     and prefer the assignees on that Job so the picker
      //     doesn't list every recruiter at the firm.
      //
      // No-context shared scope returns no staffing users.
      let staffingOrgId: string | null = null;
      let staffingUserIdScope: string[] | null = null;
      if (submissionId) {
        // Multi-firm gate: firmEngagements ACCEPTED en un ClientJob
        // accesible. Ademas, pull las assignments del job — el picker
        // NO debe listar a todos los recruiters de la agencia, solo a
        // los asignados a esta busqueda. Mirror del scope del path
        // clientJobId (line 109-137).
        const sub = await prisma.candidateSubmission.findFirst({
          where: {
            id: submissionId,
            isSharedWithClient: true,
            job: {
              firmEngagements: {
                some: {
                  status: "ACCEPTED",
                  clientJob: { clientId: ctx.clientId },
                },
              },
            },
          },
          select: {
            job: {
              select: {
                organizationId: true,
                assignments: { select: { userId: true } },
              },
            },
          },
        });
        if (sub) {
          staffingOrgId = sub.job.organizationId;
          // Siempre scopeamos a los assignees, incluso si la lista es
          // vacia. ROADMAP #21: no queremos leakear a TODOS los
          // recruiters del firm cuando un job no tiene assignments
          // formales — fail closed, no abierto.
          staffingUserIdScope = (sub.job.assignments ?? []).map((a) => a.userId);
        }
      } else if (clientJobId) {
        // If the chat tab knows which firm is targeted, scope the
        // engagement lookup to that specific Job. Otherwise fall
        // back to the first accepted engagement (the JO has only
        // one — the multi-firm case is handled by the caller
        // passing agencyJobId explicitly).
        const engagement = await prisma.firmEngagement.findFirst({
          where: {
            clientJobId,
            status: "ACCEPTED",
            jobId: agencyJobIdParam ? agencyJobIdParam : { not: null },
          },
          select: {
            organizationId: true,
            job: {
              select: {
                assignments: { select: { userId: true } },
              },
            },
          },
        });
        if (engagement) {
          staffingOrgId = engagement.organizationId;
          const assignees = engagement.job?.assignments ?? [];
          if (assignees.length > 0) {
            staffingUserIdScope = assignees.map((a) => a.userId);
          }
        }
      }

      if (staffingOrgId) {
        const staffingUsers = await prisma.user.findMany({
          where: {
            organizationId: staffingOrgId,
            isActive: true,
            ...(staffingUserIdScope ? { id: { in: staffingUserIdScope } } : {}),
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: "insensitive" as const } },
                    { email: { contains: q, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
          select: { id: true, name: true, email: true, title: true },
          take: 8,
          orderBy: { name: "asc" },
        });

        for (const u of staffingUsers) {
          results.push({ id: u.id, name: u.name, email: u.email, title: u.title, kind: "staffing" });
        }
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
