// Helpers for the per-JO membership feature on the client portal.
//
// Rule of thumb (no admin bypass — explicit decision):
//   - Visibility: a ClientUser sees a JO only when they're an explicit
//     member. The "admin" role grants team-management powers (inviting
//     teammates, changing org info) but does NOT auto-grant access to
//     every job — an admin from another branch / department shouldn't
//     see a confidential search they were never invited to.
//   - Legacy jobs (no member rows yet, created before this feature
//     shipped) stay visible to all team members: "members is empty"
//     reads as "no one explicitly restricted, defer to the workspace".
//   - The creator (postedById) is always added as a member at create
//     time so they can't lock themselves out of their own search.
//
// Management gating (who can change the member list) lives in the
// jobs/[id]/members route — same idea: it's not derived from the
// ADMIN role, only from membership + creatorship.

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
  if (job.members.length === 0) return true;
  return job.members.some((m) => m.clientUserId === ctx.clientUserId);
}
