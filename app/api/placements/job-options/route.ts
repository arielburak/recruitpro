import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { safeErrorMessage } from "@/lib/safe-error";

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
        currency: true,
        feeAmount: true,
        feeType: true,
        paymentTerms: true,
        guaranteePeriod: true,
        client: {
          select: {
            id: true,
            name: true,
            engagementType: true,
            defaultCurrency: true,
            defaultPaymentTerms: true,
            defaultFeeAmount: true,
            defaultFeeType: true,
            defaultGuaranteePeriod: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fallback chain (per request: Recruiting clients use client-level
    // defaults, Staff Aug jobs override on the job since the client's
    // defaults are intentionally null). The resolved values fall through
    // job → client → null.
    const options = jobs.map((j) => ({
      id: j.id,
      title: j.title,
      clientId: j.client.id,
      clientName: j.client.name,
      // Pre-pick the placement kind from the client's engagement type:
      // RECRUITING → HH (one-time fee), STAFF_AUG → OS (recurring MRR).
      // The form still lets the recruiter override for the rare case
      // where a normally-recruiting client does a one-off OS contract.
      defaultKind:
        j.client.engagementType === "STAFF_AUG" ? "OS" : "HH",
      jobCurrency: j.currency ?? j.client.defaultCurrency ?? "USD",
      clientPaymentTerms: j.paymentTerms ?? j.client.defaultPaymentTerms ?? null,
      clientGuaranteePeriod: j.guaranteePeriod ?? j.client.defaultGuaranteePeriod ?? null,
      clientFeeAmount: j.feeAmount?.toString() ?? j.client.defaultFeeAmount?.toString() ?? null,
      clientFeeType: (j.feeType ?? j.client.defaultFeeType) as "PERCENTAGE" | "FLAT" | null,
    }));

    return NextResponse.json(options);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 401 });
  }
}
