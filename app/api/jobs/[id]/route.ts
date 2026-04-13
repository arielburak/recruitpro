import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { jobSchema } from "@/lib/validations/job";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    let job;
    try {
      job = await prisma.job.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: {
          client: true,
          stages: { orderBy: { order: "asc" } },
          assignments: { include: { user: { select: { id: true, name: true } } } },
          documents: { orderBy: { createdAt: "desc" } },
          submissions: {
            include: {
              candidate: {
                select: {
                  id: true, firstName: true, lastName: true,
                  currentTitle: true, currentCompany: true, location: true,
                },
              },
              stage: true,
              _count: { select: { comments: true, ratings: true } },
            },
          },
        },
      });
    } catch {
      // Fallback: documents relation may not exist yet in DB
      job = await prisma.job.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: {
          client: true,
          stages: { orderBy: { order: "asc" } },
          assignments: { include: { user: { select: { id: true, name: true } } } },
          submissions: {
            include: {
              candidate: {
                select: {
                  id: true, firstName: true, lastName: true,
                  currentTitle: true, currentCompany: true, location: true,
                },
              },
              stage: true,
              _count: { select: { comments: true, ratings: true } },
            },
          },
        },
      });
    }

    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Recruiters can only view jobs they're assigned to
    if (ctx.role === "RECRUITER") {
      const isAssigned = job.assignments.some((a: any) => a.user.id === ctx.userId);
      if (!isAssigned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(job);
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
    const data = jobSchema.parse(body);

    const updated = await prisma.job.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: { ...data, feeAmount: data.feeAmount ?? null },
    });

    if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    await prisma.job.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
