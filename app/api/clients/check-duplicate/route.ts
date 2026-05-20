import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Extract just the host from a website URL so different formats of
 * the same company match:
 *   https://www.acme.com/about  →  "acme.com"
 *   http://acme.com             →  "acme.com"
 *   acme.com                    →  "acme.com"
 *   www.acme.com                →  "acme.com"
 */
function websiteHost(value: string): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  const withoutWww = withoutScheme.replace(/^www\./, "");
  const host = withoutWww.split("/")[0];
  return host.replace(/[.,;]+$/, ""); // strip stray punctuation
}

const MATCH_SELECT = {
  id: true,
  name: true,
  industry: true,
  website: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const params = request.nextUrl.searchParams;
    const name = params.get("name")?.trim() || "";
    const website = websiteHost(params.get("website") || "");
    const contactEmail = params.get("contactEmail")?.trim().toLowerCase() || "";
    const contactPhone = phoneDigits(params.get("contactPhone") || "");

    if (!name && !website && !contactEmail && !contactPhone) {
      return NextResponse.json({ matches: [] });
    }

    // Scope duplicate-detection to clients THIS agency is engaged
    // with. "Is this client already on our roster?" is the question
    // we're answering — not "does it exist anywhere in the system".
    const orgFilter = {
      engagedOrganizations: { some: { organizationId: ctx.organizationId } },
    };
    const queries: Promise<any[]>[] = [];

    if (name) {
      queries.push(
        prisma.client.findMany({
          where: { ...orgFilter, name: { equals: name, mode: "insensitive" } },
          select: MATCH_SELECT,
          take: 5,
        })
      );
    }

    if (website) {
      // Match candidates whose website *contains* the normalized host.
      // Post-filter in JS to strip false positives (e.g. "acme.com" vs
      // "acme.company").
      queries.push(
        prisma.client
          .findMany({
            where: {
              ...orgFilter,
              website: { contains: website, mode: "insensitive" },
            },
            select: MATCH_SELECT,
            take: 50,
          })
          .then((rows) =>
            rows.filter((r) => r.website && websiteHost(r.website) === website)
          )
      );
    }

    if (contactEmail) {
      queries.push(
        prisma.client.findMany({
          where: {
            ...orgFilter,
            contactEmail: { equals: contactEmail, mode: "insensitive" },
          },
          select: MATCH_SELECT,
          take: 5,
        })
      );
    }

    if (contactPhone) {
      queries.push(
        prisma.client
          .findMany({
            where: { ...orgFilter, contactPhone: { not: null } },
            select: MATCH_SELECT,
            take: 200,
          })
          .then((rows) =>
            rows.filter(
              (r) => r.contactPhone && phoneDigits(r.contactPhone) === contactPhone
            )
          )
      );
    }

    const results = (await Promise.all(queries)).flat();
    const unique = Array.from(new Map(results.map((r) => [r.id, r])).values());

    return NextResponse.json({ matches: unique.slice(0, 5) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
