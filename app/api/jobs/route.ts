import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { jobSchema } from "@/lib/validations/job";
import { logActivity } from "@/lib/activity";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const status = request.nextUrl.searchParams.get("status");
    const search = request.nextUrl.searchParams.get("search");
    const pageParam = request.nextUrl.searchParams.get("page");
    const page = parseInt(pageParam || "1");
    const pageSize = 20;
    const paginated = !!pageParam || !!search;

    const where: any = { organizationId: ctx.organizationId };

    // Recruiters only see jobs they're assigned to
    if (ctx.role === "RECRUITER") {
      where.assignments = { some: { userId: ctx.userId } };
    }

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { client: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const jobInclude = {
      client: { select: { name: true } },
      _count: { select: { submissions: true } },
      assignments: { include: { user: { select: { name: true } } } },
    };

    if (!paginated) {
      const jobs = await prisma.job.findMany({
        where,
        include: jobInclude,
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(jobs);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: jobInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.job.count({ where }),
    ]);

    return NextResponse.json({ jobs, total });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const data = jobSchema.parse(body);

    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, organizationId: ctx.organizationId },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 400 });
    }

    const job = await prisma.$transaction(async (tx) => {
      const j = await tx.job.create({
        data: {
          ...data,
          feeAmount: data.feeAmount ?? undefined,
          organizationId: ctx.organizationId,
        },
      });

      // Create pipeline stages from defaults
      await tx.pipelineStage.createMany({
        data: DEFAULT_PIPELINE_STAGES.map((s, i) => ({
          name: s.name,
          color: s.color,
          order: i,
          jobId: j.id,
        })),
      });

      // Assign creating user
      await tx.jobAssignment.create({
        data: { jobId: j.id, userId: ctx.userId },
      });

      return j;
    });

    await logActivity({
      action: "job.created",
      description: `${ctx.userName} created job "${data.title}" for ${client.name}`,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
