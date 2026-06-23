// Email canonicalization shared across auth flows.
//
// Why: Gmail aliases dots and +tags ("first.last@gmail.com" ===
// "firstlast+anything@gmail.com"). Without canonicalization, a user
// can have multiple DB rows for the same real mailbox, and any flow
// that looks them up by exact match (forgot-password, invite dup-check,
// resend-verification, sign-in lookup) silently misses.
//
// Rule:
//   1. ALWAYS exact-match first (cheap, authoritative for non-Gmail).
//   2. ONLY if exact misses AND domain is gmail.com/googlemail.com,
//      fall back to the canonical-form scan.
//
// Memory feedback_canonicalization_lookups: never gate the canonical
// fallback on whether the INPUT is canonical — gate it on whether the
// DB could store an alias (i.e. domain is Gmail). The user got burned
// by an early-exit that compared input to its own canonical form.

import { prisma } from "@/lib/prisma";

export function canonicalizeGmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const [local, domain] = lower.split("@");
  if (!local || !domain) return lower;
  if (domain !== "gmail.com" && domain !== "googlemail.com") return lower;
  const cleaned = local.split("+")[0].replace(/\./g, "");
  return `${cleaned}@gmail.com`;
}

// Returns true if the domain could store the email as a Gmail alias.
// Use this to decide whether to even try the canonical scan.
export function isGmailDomain(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1] || "";
  return domain === "gmail.com" || domain === "googlemail.com";
}

// Find a staffing User by email, tolerant of Gmail aliases. Returns
// the row or null. Mirror in oauth flows + forgot-password + resend-
// verification + admin/invites dup-check.
export async function findStaffingUserByEmail(
  email: string,
  options: { onlyActive?: boolean } = {},
) {
  const filterActive = options.onlyActive
    ? ({ isActive: true } as const)
    : {};
  const exact = await prisma.user.findFirst({
    where: { email, ...filterActive },
  });
  if (exact) return exact;
  if (!isGmailDomain(email)) return null;
  const canonical = canonicalizeGmail(email);
  const activeFilter = options.onlyActive ? `AND "isActive" = true` : "";
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    SELECT id FROM "User"
    WHERE LOWER(SPLIT_PART(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
      AND LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(email, '@', 1), '+', 1), '[.]', '', 'g')) || '@gmail.com' = $1
      ${activeFilter}
    LIMIT 1
    `,
    canonical,
  );
  if (rows.length === 0) return null;
  return prisma.user.findUnique({ where: { id: rows[0].id } });
}

// Mirror for ClientUser.
export async function findClientUserByEmail(
  email: string,
  options: { onlyActive?: boolean } = {},
) {
  const filterActive = options.onlyActive
    ? ({ isActive: true } as const)
    : {};
  const exact = await prisma.clientUser.findFirst({
    where: { email, ...filterActive },
  });
  if (exact) return exact;
  if (!isGmailDomain(email)) return null;
  const canonical = canonicalizeGmail(email);
  const activeFilter = options.onlyActive ? `AND "isActive" = true` : "";
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    SELECT id FROM "ClientUser"
    WHERE LOWER(SPLIT_PART(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
      AND LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(email, '@', 1), '+', 1), '[.]', '', 'g')) || '@gmail.com' = $1
      ${activeFilter}
    LIMIT 1
    `,
    canonical,
  );
  if (rows.length === 0) return null;
  return prisma.clientUser.findUnique({ where: { id: rows[0].id } });
}

// Look up a pending UserInvite tolerant of Gmail aliases. Used by both
// the OAuth-accept path and the admin invite dup-check (so the admin
// can't accidentally create a second invite for the same real mailbox
// with a different casing/dot variation).
export async function findPendingInviteByEmail(
  email: string,
  organizationId?: string,
) {
  const now = new Date();
  const orgFilter = organizationId ? { organizationId } : {};
  const exact = await prisma.userInvite.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: now }, ...orgFilter },
  });
  if (exact) return exact;
  if (!isGmailDomain(email)) return null;
  const canonical = canonicalizeGmail(email);
  const params: any[] = [canonical, now];
  let orgClause = "";
  if (organizationId) {
    params.push(organizationId);
    orgClause = `AND "organizationId" = $3`;
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    SELECT id FROM "UserInvite"
    WHERE "usedAt" IS NULL
      AND "expiresAt" > $2
      AND LOWER(SPLIT_PART(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
      AND LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(email, '@', 1), '+', 1), '[.]', '', 'g')) || '@gmail.com' = $1
      ${orgClause}
    ORDER BY "createdAt" DESC
    LIMIT 1
    `,
    ...params,
  );
  if (rows.length === 0) return null;
  return prisma.userInvite.findUnique({ where: { id: rows[0].id } });
}
