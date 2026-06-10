// Single source of truth for "can this user act on this Job?".
//
// The rule: visibility/mutation is strictly assignment-based — every
// user (admins included) needs an explicit JobAssignment row on the
// target Job. No org-wide bypass for ADMIN. Mirrors the gate already
// in place for the Job detail page (returns "Job not found" if you
// don't have access) so the candidate / submission / dashboard sides
// stay consistent.
//
// Was duplicated as a private helper inside app/api/jobs/[id]/route.ts.
// Extracted here because the candidate-side mutations (stage change,
// share-with-client, etc.) need the same gate — and were missing it,
// which is the security bug from ROADMAP.md (#3 Critico).

import { prisma } from "@/lib/prisma";

export async function canAccessJob(
  jobId: string,
  organizationId: string,
  userId: string
): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      assignments: { where: { userId }, select: { userId: true } },
    },
  });
  if (!job) return false;
  return job.assignments.length > 0;
}
