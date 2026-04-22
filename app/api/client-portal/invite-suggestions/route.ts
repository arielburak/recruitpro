import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

type Suggestion = {
  email: string;
  firmName: string | null;
  lastInvitedAt: string;
  // Whether this recruiter has already been invited to the CURRENT job
  // (so the UI can disable / mark them as already on this search).
  alreadyOnThisJob: boolean;
  // Best-known human name for display. Pulled from the User record when
  // they've registered, otherwise null (we only have email for pending
  // invites).
  name: string | null;
};

// GET — suggest recruiters this client has invited before (on any of their
// jobs) so they can be picked with one click instead of re-typing emails.
//
// Merges two sources:
//   - FirmEngagement rows with invitedEmail set (person-level invites).
//   - PendingFirmInvite rows (emails that never registered yet).
// Returns one row per distinct email, with the firm name when we know it,
// and a flag that tells the UI whether they're already on this very job.
export async function GET(request: Request) {
  try {
    const ctx = await getClientContext();
    const url = new URL(request.url);
    const clientJobId = url.searchParams.get("clientJobId");

    const [engagements, pending] = await Promise.all([
      prisma.firmEngagement.findMany({
        where: {
          clientJob: { clientId: ctx.clientId },
          invitedEmail: { not: null },
        },
        select: {
          clientJobId: true,
          invitedEmail: true,
          invitedAt: true,
          organization: { select: { name: true } },
          invitedUser: { select: { name: true, email: true } },
        },
        orderBy: { invitedAt: "desc" },
      }),
      prisma.pendingFirmInvite.findMany({
        where: { clientId: ctx.clientId },
        select: {
          clientJobId: true,
          email: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const byEmail = new Map<string, Suggestion>();

    for (const e of engagements) {
      const email = (e.invitedEmail || "").toLowerCase();
      if (!email) continue;
      const existing = byEmail.get(email);
      const hit: Suggestion = {
        email,
        firmName: e.organization.name || null,
        name: e.invitedUser?.name || null,
        lastInvitedAt: e.invitedAt.toISOString(),
        alreadyOnThisJob:
          existing?.alreadyOnThisJob ||
          (clientJobId ? e.clientJobId === clientJobId : false),
      };
      if (!existing || existing.lastInvitedAt < hit.lastInvitedAt) {
        // Preserve alreadyOnThisJob across deduplicated rows
        hit.alreadyOnThisJob = hit.alreadyOnThisJob || (existing?.alreadyOnThisJob ?? false);
        byEmail.set(email, hit);
      }
    }

    for (const p of pending) {
      const email = p.email.toLowerCase();
      const existing = byEmail.get(email);
      const hit: Suggestion = {
        email,
        firmName: existing?.firmName || null,
        name: existing?.name || null,
        lastInvitedAt: p.createdAt.toISOString(),
        alreadyOnThisJob:
          (existing?.alreadyOnThisJob ?? false) ||
          (clientJobId ? p.clientJobId === clientJobId : false),
      };
      if (!existing || existing.lastInvitedAt < hit.lastInvitedAt) {
        hit.alreadyOnThisJob = hit.alreadyOnThisJob || (existing?.alreadyOnThisJob ?? false);
        byEmail.set(email, hit);
      }
    }

    const suggestions = Array.from(byEmail.values()).sort((a, b) =>
      b.lastInvitedAt.localeCompare(a.lastInvitedAt)
    );

    return NextResponse.json(suggestions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
