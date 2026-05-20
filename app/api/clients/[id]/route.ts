import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { clientSchema } from "@/lib/validations/client";
import { clientAccessWhere } from "@/lib/client-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const client = await prisma.client.findFirst({
      where: { id, ...clientAccessWhere(ctx.organizationId) },
      include: {
        // Scope sub-collections to THIS agency where it matters:
        // Jobs are agency-owned (Job.organizationId) so other
        // agencies' Jobs at this shared Client stay invisible.
        jobs: {
          where: { organizationId: ctx.organizationId },
          include: { _count: { select: { submissions: true } } },
        },
        clientUsers: { select: { id: true, name: true, email: true, isActive: true } },
      },
    });
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(client);
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
    const data = clientSchema.parse(body);

    // Membership check via the engagement join. Without it, agency Y
    // could PUT into agency X's Acme record.
    const engaged = await prisma.client.findFirst({
      where: { id, ...clientAccessWhere(ctx.organizationId) },
      select: { id: true },
    });
    if (!engaged) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.client.update({ where: { id }, data });
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

    // "Delete client" on the agency side = disengage from the
    // hiring company. The Client row itself stays — other agencies
    // (and the hiring company's portal users) keep working. The
    // agency's own Jobs at this Client are NOT auto-deleted; those
    // are agency-owned and can be cleaned up via /jobs.
    await prisma.organizationClient.deleteMany({
      where: { organizationId: ctx.organizationId, clientId: id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
