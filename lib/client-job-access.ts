// Helpers for the per-JO membership feature on the client portal.
//
// Rule of thumb:
//   - Admins see every ClientJob of their Client.
//   - Non-admins see jobs where the members list is EMPTY (backwards
//     compat: the feature post-dates many jobs) OR where they're
//     explicitly a member.
//   - The creator (postedById) is always added as a member at create
//     time so the recruiter who posted the job never gets locked out
//     of their own search.

import type { Prisma } from "@/app/generated/prisma/client";

export type ClientCtx = {
  clientUserId: string;
  clientId: string;
  role: "ADMIN" | "USER";
};

// Where-clause fragment for Prisma queries that need to filter
// ClientJobs by visibility. Combine with other conditions via
// spread / AND as needed.
export function clientJobAccessWhere(ctx: ClientCtx): Prisma.ClientJobWhereInput {
  if (ctx.role === "ADMIN") {
    return { clientId: ctx.clientId };
  }
  return {
    clientId: ctx.clientId,
    OR: [
      { members: { none: {} } },
      { members: { some: { clientUserId: ctx.clientUserId } } },
    ],
  };
}

// Single-row variant: returns the boolean needed by detail endpoints
// to 404 when the caller shouldn't see the job. Pass the job's
// members + clientId; we don't refetch.
export function canAccessClientJob(
  ctx: ClientCtx,
  job: { clientId: string; members: { clientUserId: string }[] }
): boolean {
  if (job.clientId !== ctx.clientId) return false;
  if (ctx.role === "ADMIN") return true;
  if (job.members.length === 0) return true;
  return job.members.some((m) => m.clientUserId === ctx.clientUserId);
}
