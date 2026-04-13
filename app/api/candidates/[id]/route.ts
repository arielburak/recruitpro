import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { candidateSchema } from "@/lib/validations/candidate";
import { logActivity } from "@/lib/activity";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    const candidate = await prisma.candidate.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        owner: { select: { name: true, email: true } },
        documents: true,
        submissions: {
          include: {
            job: { select: { title: true, id: true, clientId: true } },
            stage: { select: { name: true, color: true } },
            ratings: {
              select: { score: true, feedback: true, clientUser: { select: { name: true } } },
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
              orderBy: { createdAt: "desc" },
            },
          },
        },
        comments: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { user: { select: { name: true } } },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(candidate);
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
    const data = candidateSchema.parse(body);

    const candidate = await prisma.candidate.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...data,
        currentSalary: data.currentSalary ?? null,
        desiredSalary: data.desiredSalary ?? null,
      },
    });

    if (candidate.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await logActivity({
      action: "candidate.updated",
      description: `${ctx.userName} updated candidate ${data.firstName} ${data.lastName}`,
      userId: ctx.userId,
      candidateId: id,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
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

    const deleted = await prisma.candidate.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
