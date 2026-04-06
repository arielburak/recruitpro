import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await getOrgContext();
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    return NextResponse.json(subscription);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
