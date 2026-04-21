import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// GET — list all pipeline stages for this client (ordered).
//
// The stages are fixed ATS-wide (see lib/constants.ts → DEFAULT_STAGES) and
// customization is intentionally not supported, so this route only exposes
// reads — create/update/delete endpoints were removed on purpose.
export async function GET() {
  try {
    const ctx = await getClientContext();

    const stages = await prisma.clientPipelineStage.findMany({
      where: { clientId: ctx.clientId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        color: true,
        isTerminal: true,
        kind: true,
      },
    });

    return NextResponse.json(stages);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
