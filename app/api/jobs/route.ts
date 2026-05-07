import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { jobSchema } from "@/lib/validations/job";
import { logActivity } from "@/lib/activity";
import { DEFAULT_STAGES } from "@/lib/constants";

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

    // Non-admins see only their assigned jobs.
    //
    // Admins see every job in the org EXCEPT jobs born from a person-
    // level client-portal invite they weren't invited to. Those jobs
    // stay private to the invited recruiter (and anyone that recruiter
    // chose to assign) — that's the whole point of person-level
    // invites. A job becomes "private" when it has at least one
    // FirmEngagement row with invitedUserId set; legacy jobs without
    // such engagements keep the old org-wide admin visibility.
    if (ctx.role !== "ADMIN") {
      where.assignments = { some: { userId: ctx.userId } };
    } else {
      where.OR = [
        { firmEngagements: { none: { invitedUserId: { not: null } } } },
        { assignments: { some: { userId: ctx.userId } } },
      ];
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
      client: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
      assignments: { include: { user: { select: { id: true, name: true } } } },
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

      // Create the canonical 9 pipeline stages
      await tx.pipelineStage.createMany({
        data: DEFAULT_STAGES.map((s, i) => ({
          name: s.name,
          color: s.color,
          isTerminal: s.isTerminal,
          kind: s.kind,
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
