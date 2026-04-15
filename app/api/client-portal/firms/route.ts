import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// List all firms engaged with this client's jobs
export async function GET() {
  try {
    const ctx = await getClientContext();

    const engagements = await prisma.firmEngagement.findMany({
      where: {
        clientJob: { clientId: ctx.clientId },
        status: "ACCEPTED",
      },
      select: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    // Deduplicate firms
    const firmMap = new Map<string, { id: string; name: string }>();
    for (const eng of engagements) {
      firmMap.set(eng.organization.id, {
        id: eng.organization.id,
        name: eng.organization.name,
      });
    }

    return NextResponse.json(Array.from(firmMap.values()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
