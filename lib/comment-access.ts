// Server-side scope guard for comment writes. Centralizes two rules
// that until now lived only in the UI:
//
//   1. CLIENT_VISIBLE comments on a per-submission chat are only
//      allowed once the submission has been shared with the client
//      (isSharedWithClient=true). Posting a CLIENT_VISIBLE row before
//      that would notify the client about a candidate they can't see.
//
//   2. The `mentions` array can only carry IDs of people who have
//      access to the destination. Anything outside that set is
//      silently dropped — we don't 400 the request because the
//      common cause is a stale picker, not a malicious payload, and
//      the rest of the comment is still valid.
//
// Helper is meant to be called from any handler that writes Comment
// rows (agency side: /api/comments, client side: /api/client-portal/
// jobs/[id]/comments). If you add a third surface, route it through
// here instead of duplicating the checks.

import type { PrismaClient } from "@/app/generated/prisma/client";

export type CommentScopeIntent = {
  type: "INTERNAL" | "CLIENT_VISIBLE" | "CLIENT_INTERNAL";
  // Exactly one of these three should be set per intent (mirrors
  // the Comment model). We don't enforce that — callers know.
  submissionId?: string | null;
  candidateId?: string | null;
  jobId?: string | null;       // agency-side Job.id
  clientJobId?: string | null; // ClientJob.id
  mentions: string[];
};

// authorId is added to every "valid mentioners" set: a user can
// always tag themselves (the UI may not allow it, but if it ever
// does it shouldn't get silently dropped).
export type CommentScopeActor =
  | { kind: "agency"; userId: string; organizationId: string; role: "ADMIN" | "USER" }
  | { kind: "client"; clientUserId: string; clientId: string };

export type CommentScopeResult =
  | { allowed: true; mentions: string[] }
  | { allowed: false; status: number; error: string };

export async function validateCommentScope(
  prisma: PrismaClient,
  actor: CommentScopeActor,
  intent: CommentScopeIntent,
): Promise<CommentScopeResult> {
  const { type, submissionId, jobId, clientJobId, candidateId } = intent;
  const requested = Array.from(new Set(intent.mentions));

  // ─── Per-submission chat ────────────────────────────────────────
  if (submissionId) {
    const sub = await prisma.candidateSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        isSharedWithClient: true,
        jobId: true,
        job: {
          select: {
            id: true,
            organizationId: true,
            clientId: true,
            assignments: { select: { userId: true } },
          },
        },
      },
    });
    if (!sub) return { allowed: false, status: 404, error: "Submission not found" };

    // Rule 1: CLIENT_VISIBLE only after share.
    if (type === "CLIENT_VISIBLE" && !sub.isSharedWithClient) {
      return {
        allowed: false,
        status: 403,
        error:
          "Share this candidate with the client before posting a client-visible note.",
      };
    }

    // Valid mention set.
    //   INTERNAL / candidate-scope → only agency-side: assignees +
    //     org admins + the author. No clients in an internal chat.
    //   CLIENT_VISIBLE → assignees + admins on the agency side AND
    //     ClientJobMembers of the ClientJob backing this submission's
    //     Job (when one exists).
    const validUserIds = await collectAgencyJobUserIds(prisma, {
      jobId: sub.jobId,
      organizationId: sub.job.organizationId,
      assignees: sub.job.assignments.map((a) => a.userId),
    });

    let validClientUserIds: Set<string> = new Set();
    if (type === "CLIENT_VISIBLE") {
      validClientUserIds = await collectClientJobMemberIds(prisma, {
        agencyJobId: sub.jobId,
        clientId: sub.job.clientId,
      });
    }

    const valid = new Set([...validUserIds, ...validClientUserIds]);
    if (actor.kind === "agency") valid.add(actor.userId);
    else valid.add(actor.clientUserId);

    return { allowed: true, mentions: requested.filter((id) => valid.has(id)) };
  }

  // ─── Job-level chat (agency side) ───────────────────────────────
  if (jobId) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        organizationId: true,
        clientId: true,
        assignments: { select: { userId: true } },
      },
    });
    if (!job) return { allowed: false, status: 404, error: "Job not found" };

    const validUserIds = await collectAgencyJobUserIds(prisma, {
      jobId: job.id,
      organizationId: job.organizationId,
      assignees: job.assignments.map((a) => a.userId),
    });

    let validClientUserIds: Set<string> = new Set();
    if (type === "CLIENT_VISIBLE") {
      validClientUserIds = await collectClientJobMemberIds(prisma, {
        agencyJobId: job.id,
        clientId: job.clientId,
      });
    }

    const valid = new Set([...validUserIds, ...validClientUserIds]);
    if (actor.kind === "agency") valid.add(actor.userId);
    else valid.add(actor.clientUserId);

    return { allowed: true, mentions: requested.filter((id) => valid.has(id)) };
  }

  // ─── ClientJob-level chat (client portal) ───────────────────────
  if (clientJobId) {
    const cj = await prisma.clientJob.findUnique({
      where: { id: clientJobId },
      select: {
        id: true,
        clientId: true,
        members: { select: { clientUserId: true } },
        engagements: {
          where: { status: "ACCEPTED", jobId: { not: null } },
          select: {
            organizationId: true,
            jobId: true,
            job: { select: { assignments: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!cj) return { allowed: false, status: 404, error: "Job not found" };

    const validClientUserIds = new Set(cj.members.map((m) => m.clientUserId));

    const validUserIds = new Set<string>();
    if (type === "CLIENT_VISIBLE") {
      // Include the staffing side: assignees of any accepted
      // engagement's agency Job. Empty when no firm has accepted.
      for (const eng of cj.engagements) {
        for (const a of eng.job?.assignments ?? []) validUserIds.add(a.userId);
      }
    }

    const valid = new Set([...validClientUserIds, ...validUserIds]);
    if (actor.kind === "agency") valid.add(actor.userId);
    else valid.add(actor.clientUserId);

    return { allowed: true, mentions: requested.filter((id) => valid.has(id)) };
  }

  // ─── Candidate-level chat (always agency, no client side) ───────
  if (candidateId) {
    const cand = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, ownerId: true, organizationId: true },
    });
    if (!cand) return { allowed: false, status: 404, error: "Candidate not found" };

    const admins = await prisma.user.findMany({
      where: { organizationId: cand.organizationId, role: "ADMIN", isActive: true },
      select: { id: true },
    });
    const valid = new Set<string>(admins.map((a) => a.id));
    if (cand.ownerId) valid.add(cand.ownerId);
    if (actor.kind === "agency") valid.add(actor.userId);

    return { allowed: true, mentions: requested.filter((id) => valid.has(id)) };
  }

  // No destination at all — let the caller's own validation 400 it.
  return { allowed: true, mentions: [] };
}

// ─── Internal helpers ──────────────────────────────────────────────

async function collectAgencyJobUserIds(
  prisma: PrismaClient,
  args: { jobId: string; organizationId: string; assignees: string[] },
): Promise<Set<string>> {
  // Anyone who could open the Job today (mirrors canAccessJob in
  // /api/jobs/[id]): assignees + org admins.
  const admins = await prisma.user.findMany({
    where: { organizationId: args.organizationId, role: "ADMIN", isActive: true },
    select: { id: true },
  });
  const set = new Set<string>(args.assignees);
  for (const a of admins) set.add(a.id);
  return set;
}

async function collectClientJobMemberIds(
  prisma: PrismaClient,
  args: { agencyJobId: string; clientId: string | null },
): Promise<Set<string>> {
  if (!args.clientId) return new Set();
  const engagement = await prisma.firmEngagement.findFirst({
    where: { jobId: args.agencyJobId, status: "ACCEPTED" },
    select: { clientJobId: true },
  });
  if (!engagement) return new Set();
  const members = await prisma.clientJobMember.findMany({
    where: { clientJobId: engagement.clientJobId },
    select: { clientUserId: true },
  });
  return new Set(members.map((m) => m.clientUserId));
}
