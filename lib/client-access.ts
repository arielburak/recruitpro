// Access helpers for the agency-side view of Clients.
//
// Background: a hiring company (Client row) used to be "owned" by
// exactly one agency Organization via Client.organizationId. That
// caused duplication every time two agencies worked with the same
// hiring company. The OrganizationClient join table lifts ownership
// out of the Client row — multiple agencies can engage with one
// Client, and each agency's listing / detail / mutation routes
// filter via this join instead of Client.organizationId.
//
// Client.organizationId is still set when the agency creates a
// Client (audit metadata: "who originally added this Acme record")
// but should NOT be relied on for authorization. Use these helpers.

import type { Prisma } from "@/app/generated/prisma/client";

// Where-fragment to scope ClientWhereInput by "this agency is
// engaged with the client". Spread / AND into other conditions.
export function clientAccessWhere(orgId: string): Prisma.ClientWhereInput {
  return {
    engagedOrganizations: {
      some: { organizationId: orgId },
    },
  };
}

// Convenience: throws-style check that returns the client if the
// agency can see it, or null otherwise. Use in single-row endpoints.
export async function findClientForOrg(
  prisma: any,
  orgId: string,
  clientId: string
) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      engagedOrganizations: { some: { organizationId: orgId } },
    },
  });
}
