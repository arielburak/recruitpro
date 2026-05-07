import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Lightweight feed for the manual placement dialog. Returns just enough per
// job to pre-fill the form (commercial terms come from the client; fee
// hints come from the job itself if it overrides the client default).
export async function GET() {
  try {
    const ctx = await getOrgContext();

    const jobs = await prisma.job.findMany({
      where: {
        organizationId: ctx.organizationId,
        // Surface every non-closed job so the recruiter can back-fill a
        // placement on a job that's still technically open.
        status: { not: "CLOSED" },
      },
      select: {
        id: true,
        title: true,
        feeAmount: true,
        feeType: true,
        client: {
          select: {
            id: true,
            name: true,
            defaultPaymentTerms: true,
            defaultFeeAmount: true,
            defaultFeeType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const options = jobs.map((j) => ({
      id: j.id,
      title: j.title,
      clientId: j.client.id,
      clientName: j.client.name,
      clientPaymentTerms: j.client.defaultPaymentTerms ?? null,
      clientFeeAmount: j.feeAmount?.toString() ?? j.client.defaultFeeAmount?.toString() ?? null,
      clientFeeType: (j.feeType ?? j.client.defaultFeeType) as "PERCENTAGE" | "FLAT" | null,
    }));

    return NextResponse.json(options);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
