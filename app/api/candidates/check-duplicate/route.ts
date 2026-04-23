import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

/**
 * Extract just the digits from any phone format. Lets us compare
 * "+54 11 1234-5678" against "54 9 11 1234 5678" consistently.
 */
function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Pull the handle out of a LinkedIn URL so different formats of the
 * same profile match:
 *   https://www.linkedin.com/in/nico/  →  "nico"
 *   linkedin.com/in/nico               →  "nico"
 *   in/nico                            →  "nico"
 * Returns empty string if we can't find a handle.
 */
function linkedInHandle(value: string): string {
  if (!value) return "";
  const lower = value.trim().toLowerCase();
  // Support both full URLs and shorthand like "in/nico"
  const match = lower.match(/(?:linkedin\.com\/in\/|^\/?in\/)([a-z0-9\-_.]+)/i);
  return match ? match[1].replace(/\/$/, "") : "";
}

const MATCH_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  linkedIn: true,
  currentTitle: true,
  currentCompany: true,
  createdAt: true,
  owner: { select: { id: true, name: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const params = request.nextUrl.searchParams;
    const email = params.get("email")?.trim().toLowerCase() || "";
    const phone = phoneDigits(params.get("phone") || "");
    const linkedIn = linkedInHandle(params.get("linkedIn") || "");

    // Nothing to check — avoids an unnecessary query.
    if (!email && !phone && !linkedIn) {
      return NextResponse.json({ matches: [] });
    }

    const orgFilter = { organizationId: ctx.organizationId };
    const queries: Promise<any[]>[] = [];

    if (email) {
      queries.push(
        prisma.candidate.findMany({
          where: { ...orgFilter, email: { equals: email, mode: "insensitive" } },
          select: MATCH_SELECT,
          take: 5,
        })
      );
    }

    // For phone and LinkedIn we pull candidates where the column isn't
    // null and filter in JS — stored values come in many formats, so a
    // direct SQL equality check isn't reliable. For MVP org sizes this
    // is fine; if it gets slow we can add a normalized shadow column.
    if (phone) {
      queries.push(
        prisma.candidate
          .findMany({
            where: { ...orgFilter, phone: { not: null } },
            select: MATCH_SELECT,
            take: 200,
          })
          .then((rows) =>
            rows.filter((r) => r.phone && phoneDigits(r.phone) === phone)
          )
      );
    }

    if (linkedIn) {
      queries.push(
        prisma.candidate
          .findMany({
            where: {
              ...orgFilter,
              linkedIn: { contains: linkedIn, mode: "insensitive" },
            },
            select: MATCH_SELECT,
            take: 50,
          })
          .then((rows) =>
            rows.filter((r) => r.linkedIn && linkedInHandle(r.linkedIn) === linkedIn)
          )
      );
    }

    const results = (await Promise.all(queries)).flat();

    // Dedupe by id — a single candidate can match on multiple channels.
    const unique = Array.from(new Map(results.map((r) => [r.id, r])).values());

    return NextResponse.json({ matches: unique.slice(0, 5) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
