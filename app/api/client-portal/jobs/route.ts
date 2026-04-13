import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getClientContext();

    const jobs = await prisma.clientJob.findMany({
      where: { clientId: ctx.clientId },
      include: {
        postedBy: { select: { name: true } },
        engagements: {
          include: {
            organization: { select: { name: true, id: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(jobs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    const body = await request.json();

    if (!body.title) {
      return NextResponse.json({ error: "Job title is required" }, { status: 400 });
    }

    const job = await prisma.clientJob.create({
      data: {
        title: body.title,
        description: body.description || null,
        requirements: body.requirements || null,
        location: body.location || null,
        salaryRange: body.salaryRange || null,
        jobType: body.jobType || "Full-time",
        isRemote: body.isRemote || false,
        clientId: ctx.clientId,
        postedById: ctx.clientUserId,
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
