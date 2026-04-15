import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { candidateSchema } from "@/lib/validations/candidate";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: any = { organizationId: ctx.organizationId };

    // Non-admin sees own candidates by default
    if (ctx.role !== "ADMIN" && searchParams.get("mine") !== "false") {
      where.ownerId = ctx.userId;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { currentCompany: { contains: search, mode: "insensitive" } },
        { currentTitle: { contains: search, mode: "insensitive" } },
      ];
    }

    // Filters
    const ownerId = searchParams.get("ownerId");
    const location = searchParams.get("location");
    const jobId = searchParams.get("jobId");
    const clientId = searchParams.get("clientId");

    if (ownerId) {
      const ownerIds = ownerId.split(",");
      where.ownerId = ownerIds.length === 1 ? ownerIds[0] : { in: ownerIds };
    }

    if (location) {
      const locations = location.split(",");
      where.location = locations.length === 1
        ? locations[0]
        : { in: locations };
    }

    if (jobId) {
      const jobIds = jobId.split(",");
      where.submissions = {
        some: { jobId: jobIds.length === 1 ? jobIds[0] : { in: jobIds } },
      };
    }

    if (clientId) {
      const clientIds = clientId.split(",");
      where.submissions = {
        ...where.submissions,
        some: {
          ...where.submissions?.some,
          job: {
            clientId: clientIds.length === 1 ? clientIds[0] : { in: clientIds },
          },
        },
      };
    }

    // Sorting
    const sort = searchParams.get("sort");
    let orderBy: any = { createdAt: "desc" };
    if (sort === "name_asc") orderBy = [{ firstName: "asc" }, { lastName: "asc" }];
    else if (sort === "name_desc") orderBy = [{ firstName: "desc" }, { lastName: "desc" }];
    else if (sort === "created_asc") orderBy = { createdAt: "asc" };

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
          _count: { select: { submissions: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.candidate.count({ where }),
    ]);

    return NextResponse.json({ candidates, total, page, limit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const data = candidateSchema.parse(body);

    const candidate = await prisma.candidate.create({
      data: {
        ...data,
        currentSalary: data.currentSalary ?? undefined,
        desiredSalary: data.desiredSalary ?? undefined,
        organizationId: ctx.organizationId,
        ownerId: ctx.userId,
      },
    });

    await logActivity({
      action: "candidate.created",
      description: `${ctx.userName} added candidate ${data.firstName} ${data.lastName}`,
      userId: ctx.userId,
      candidateId: candidate.id,
      organizationId: ctx.organizationId,
    });

    return NextResponse.json(candidate, { status: 201 });
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
