import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { generateClientPortalToken } from "@/lib/tokens";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const { clientId, jobId, expiresInDays } = body;

    // Verify client belongs to org
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const token = await generateClientPortalToken(clientId, jobId, expiresInDays);
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const portalUrl = `${baseUrl}/client-portal/${token.token}`;

    return NextResponse.json({ token: token.token, portalUrl }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
