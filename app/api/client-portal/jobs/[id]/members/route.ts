import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";

// Manage which ClientUsers can see a given ClientJob.
//
// Auth: only the JO's creator (postedBy) or a Client admin can change
// the member list. Other team members can READ it (returns the list)
// but can't mutate it — they'd just be removing themselves.
//
// PUT body: { memberIds: string[] }. Replaces the full list. The
// creator is always re-added if missing so they can't lock
// themselves out. Member IDs are filtered to ClientUsers under the
// same Client so a malicious payload can't grant cross-Client
// access.

async function loadJob(jobId: string, ctxClientId: string) {
  return prisma.clientJob.findFirst({
    where: { id: jobId, clientId: ctxClientId },
    include: {
      members: { select: { clientUserId: true } },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const job = await loadJob(id, ctx.clientId);
    if (!job || !canAccessClientJob(ctx, job)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const members = await prisma.clientJobMember.findMany({
      where: { clientJobId: id },
      include: {
        clientUser: { select: { id: true, name: true, email: true, role: true, title: true } },
      },
    });

    return NextResponse.json({
      postedById: job.postedById,
      members: members.map((m) => m.clientUser),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;

    const job = await loadJob(id, ctx.clientId);
    if (!job || !canAccessClientJob(ctx, job)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const canManage = ctx.role === "ADMIN" || job.postedById === ctx.clientUserId;
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the job's creator or a client admin can manage access." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawIds: string[] = Array.isArray(body.memberIds)
      ? body.memberIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    // Validate every id belongs to this Client + is active. Filter
    // server-side so an admin doesn't accidentally promote an
    // inactive seat or grant cross-Client access via a copy-paste.
    const valid = rawIds.length
      ? await prisma.clientUser.findMany({
          where: { id: { in: rawIds }, clientId: ctx.clientId, isActive: true },
          select: { id: true },
        })
      : [];
    const finalIds = new Set<string>([
      job.postedById,
      ...valid.map((v) => v.id),
    ]);

    await prisma.$transaction([
      prisma.clientJobMember.deleteMany({ where: { clientJobId: id } }),
      prisma.clientJobMember.createMany({
        data: Array.from(finalIds).map((cuId) => ({
          clientJobId: id,
          clientUserId: cuId,
        })),
      }),
    ]);

    return NextResponse.json({ success: true, count: finalIds.size });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
