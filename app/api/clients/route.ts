import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { clientSchema } from "@/lib/validations/client";
import { DEFAULT_STAGES } from "@/lib/constants";
import { clientAccessWhere } from "@/lib/client-access";
import { findSimilarClients } from "@/lib/client-dedup";
import { safeErrorMessage } from "@/lib/safe-error";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const search = request.nextUrl.searchParams.get("search");
    const pageParam = request.nextUrl.searchParams.get("page");
    const page = parseInt(pageParam || "1");
    const pageSize = 20;
    const paginated = !!pageParam || !!search;

    // Access via engagement, not via Client.organizationId. A hiring
    // company lives once in the DB; agencies that engaged with it see
    // it via the OrganizationClient join.
    const where: any = clientAccessWhere(ctx.organizationId);
    if (search) {
      where.AND = [{
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { industry: { contains: search, mode: "insensitive" } },
          {
            contacts: {
              some: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      }];
    }

    // Include the primary contact so the list row can show a real
    // "who to contact" column instead of the legacy inline fields.
    const include = {
      _count: { select: { jobs: true } },
      contacts: {
        where: { isPrimary: true },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          title: true,
        },
        take: 1,
      },
    };

    if (!paginated) {
      const clients = await prisma.client.findMany({
        where,
        include,
        orderBy: { name: "asc" },
      });
      return NextResponse.json(clients);
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json({ clients, total });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const data = clientSchema.parse(body);

    // Duplicate guard: refuse to silently create another row when the
    // org already has a Client that normalizes to the same name. The
    // recruiter has to either pick "use existing" (front-end calls the
    // existing client's ID) or set force=true on the retry to
    // acknowledge they really meant to create a separate row. Without
    // this we end up with the Lionpoint / Lionpoint Partners /
    // Lionpointpartners situation that needed a one-time merge script
    // to untangle.
    if (!body.force) {
      const dupes = await findSimilarClients(ctx.organizationId, data.name);
      if (dupes.length > 0) {
        return NextResponse.json(
          {
            error: "duplicate_name",
            message: `An existing client looks like the same company. Use it instead, or confirm to create anyway.`,
            duplicates: dupes,
          },
          { status: 409 }
        );
      }
    }

    // Create the Client + the engagement in one transaction so a
    // failed engagement insert doesn't leave a Client orphaned from
    // its creator. Client.organizationId is kept as audit metadata
    // ("created by this org") but the OrganizationClient row is what
    // grants visibility going forward.
    const client = await prisma.$transaction(async (tx) => {
      const c = await tx.client.create({
        data: { ...data, organizationId: ctx.organizationId },
      });
      await tx.organizationClient.create({
        data: { organizationId: ctx.organizationId, clientId: c.id },
      });
      await tx.clientPipelineStage.createMany({
        data: DEFAULT_STAGES.map((s, i) => ({
          name: s.name,
          order: i,
          color: s.color,
          isTerminal: s.isTerminal,
          kind: s.kind,
          clientId: c.id,
        })),
      });
      return c;
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
