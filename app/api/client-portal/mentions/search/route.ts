import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Search users for @mention autocomplete in the client portal.
// scope=internal → only ClientUser of the caller's client
// scope=shared   → ClientUser of the client + staffing Users from firms with an engagement on this submission's job
// Optional: ?submissionId=xxx (required for shared scope to scope staffing users)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const params = request.nextUrl.searchParams;
    const scope = params.get("scope") === "shared" ? "shared" : "internal";
    const q = (params.get("q") || "").trim();
    const submissionId = params.get("submissionId") || "";

    const results: Array<{ id: string; name: string; email: string; kind: "client" | "staffing"; title?: string | null }> = [];

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
      select: { id: true, name: true, email: true, title: true },
      take: 8,
      orderBy: { name: "asc" },
    });

    for (const u of clientUsers) {
      results.push({ id: u.id, name: u.name, email: u.email, title: u.title, kind: "client" });
    }

    if (scope === "shared" && submissionId) {
      // Verify submission belongs to this client and is shared
      const sub = await prisma.candidateSubmission.findFirst({
        where: {
          id: submissionId,
          isSharedWithClient: true,
          job: { clientId: ctx.clientId },
        },
        select: { job: { select: { organizationId: true } } },
      });

      if (sub) {
        const staffingUsers = await prisma.user.findMany({
          where: {
            organizationId: sub.job.organizationId,
            isActive: true,
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
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
