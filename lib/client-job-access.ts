// Helpers for the per-JO membership feature on the client portal.
//
// Rule of thumb (no admin bypass — explicit decision):
//   - Visibility: a ClientUser sees a JO ONLY when they're an
//     explicit member. The "admin" role grants team-management powers
//     (inviting teammates, changing org info) but does NOT auto-grant
//     access to every job — an admin from another branch / department
//     shouldn't see a confidential search they were never invited to.
//   - The creator (postedById) is always added as a member at create
//     time so they can't lock themselves out of their own search.
//   - **No more "legacy-open" fallback.** Previously a ClientJob with
//     zero member rows was treated as visible-to-all on the
//     assumption that legacy rows pre-dated the feature. That bridge
//     was leaking: a teammate invited only to the portal (not to a
//     specific Job) could see jobs that had no members. Every active
//     ClientJob now requires at least one explicit member row, and
//     the migration in lib/migrations/client-job-members.ts seeds
//     any historical row that's missing one.
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
    members: { some: { clientUserId: ctx.clientUserId } },
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
  return job.members.some((m) => m.clientUserId === ctx.clientUserId);
}

// The agency-side Job IDs whose linked ClientJob is visible to this
// ClientUser. Use this to filter CandidateSubmission queries on the
// client portal — a submission's jobId always points at the agency
// Job, never at the ClientJob, so the portal needs the intersection
// of "submissions shared with this client" AND "the underlying
// ClientJob is one I can see".
//
// Returns a string[] of agency Job IDs. An empty array means "no
// access" — callers should short-circuit the query (set jobId to a
// sentinel like "__none__" so Prisma returns nothing).
export async function accessibleAgencyJobIds(
  prisma: any,
  ctx: ClientCtx,
): Promise<string[]> {
  const accessibleClientJobs = await prisma.clientJob.findMany({
    where: clientJobAccessWhere(ctx),
    select: { id: true },
  });
  if (accessibleClientJobs.length === 0) return [];

  const clientJobIds = accessibleClientJobs.map((j: { id: string }) => j.id);

  // Only ACCEPTED FirmEngagements have an agency-side Job linked.
  // PENDING / DECLINED rows don't back any candidate submissions yet.
  const engagements = await prisma.firmEngagement.findMany({
    where: {
      clientJobId: { in: clientJobIds },
      jobId: { not: null },
      status: "ACCEPTED",
    },
    select: { jobId: true },
  });
  return engagements
    .map((e: { jobId: string | null }) => e.jobId)
    .filter((v: string | null): v is string => !!v);
}
