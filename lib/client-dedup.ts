// Normalization + similar-name lookup for hiring Clients. Used both
// by the merge script (one-time cleanup) and the create-Client guard
// (prevention). Keep these two surfaces in sync — they share the same
// definition of "looks like the same company".

import { prisma } from "./prisma";

const SUFFIXES = [
  "partners",
  "partner",
  "holdings",
  "group",
  "consulting",
  "limited",
  "ltd",
  "llc",
  "inc",
  "corp",
  "corporation",
  "gmbh",
  "company",
  "co",
  "sa",
  "ag",
];

// Collapse case, punctuation, and noisy corporate-form suffixes so
// "Acme", "Acme Inc", "Acme Inc." and "AcmeInc" all hash the same.
// Order matters: we strip non-alphanumeric FIRST so the run-together
// case ("Lionpointpartners") still gets the suffix lopped off.
export function normalizeClientName(name: string): string {
  let s = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!s) return "";
  for (let i = 0; i < 2; i++) {
    const hit = SUFFIXES.find((suf) => s.endsWith(suf) && s.length > suf.length);
    if (!hit) break;
    s = s.slice(0, -hit.length);
  }
  return s;
}

// Find Clients in the same org that look like duplicates of the
// requested name. Used by POST /api/clients to bounce the recruiter
// back with suggestions before they create another "Lionpointpartners"
// next to "Lionpoint Partners".
export async function findSimilarClients(
  organizationId: string,
  candidateName: string
) {
  const normalized = normalizeClientName(candidateName);
  if (!normalized) return [];

  const sameOrgClients = await prisma.client.findMany({
    where: {
      engagedOrganizations: { some: { organizationId } },
    },
    select: { id: true, name: true, industry: true },
  });

  return sameOrgClients.filter((c) => normalizeClientName(c.name) === normalized);
}
