import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

type Status = "accepted" | "pending" | "declined" | "email_sent";

type Suggestion = {
  email: string;
  firmName: string | null;
  name: string | null;
  lastInvitedAt: string;
  // Tells the UI how to render this row (what pill to show). Reflects
  // the most recent status for this recruiter across all jobs at this
  // client — accepted-on-another-job is a stronger signal than pending,
  // etc.
  status: Status;
  // True only if this recruiter has been invited to THE SPECIFIC job
  // the picker is open on (query param `clientJobId`). We surface this
  // separately from `status` so the UI can disable selection and say
  // "already on this job" instead of silently swallowing the click.
  alreadyOnThisJob: boolean;
};

// GET — recruiters this client has interacted with before, across any of
// their jobs. Merges FirmEngagement + PendingFirmInvite, dedupes by
// email, and marks whether each one is already on the current job.
//
// Ordered by most-recently-invited first so the people you've been
// working with lately float to the top.
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
          status: true,
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

    // We build the map oldest-to-newest so the later (more recent) rows
    // win on status and timestamps while we still OR-accumulate the
    // "already on this job" flag across all rows for the same email.
    const byEmail = new Map<string, Suggestion>();

    // Rank engagement statuses so "accepted" beats "pending" beats
    // "declined" when the same recruiter appears on multiple jobs.
    const rank: Record<Status, number> = {
      accepted: 3,
      pending: 2,
      email_sent: 1,
      declined: 0,
    };

    function statusOf(s: string | null | undefined): Status {
      if (s === "ACCEPTED") return "accepted";
      if (s === "DECLINED") return "declined";
      return "pending";
    }

    function upsert(email: string, hit: Suggestion) {
      const existing = byEmail.get(email);
      if (!existing) {
        byEmail.set(email, hit);
        return;
      }
      // Prefer the more-recent row as the base, but keep the highest-
      // ranked status we've seen and OR the already-on-this-job flag.
      const base = hit.lastInvitedAt > existing.lastInvitedAt ? hit : existing;
      const topStatus =
        rank[hit.status] >= rank[existing.status] ? hit.status : existing.status;
      byEmail.set(email, {
        ...base,
        firmName: base.firmName || existing.firmName || hit.firmName,
        name: base.name || existing.name || hit.name,
        status: topStatus,
        alreadyOnThisJob: existing.alreadyOnThisJob || hit.alreadyOnThisJob,
      });
    }

    for (const e of engagements) {
      const email = (e.invitedEmail || "").toLowerCase();
      if (!email) continue;
      upsert(email, {
        email,
        firmName: e.organization.name || null,
        name: e.invitedUser?.name || null,
        lastInvitedAt: e.invitedAt.toISOString(),
        status: statusOf(e.status),
        alreadyOnThisJob: clientJobId ? e.clientJobId === clientJobId : false,
      });
    }

    for (const p of pending) {
      const email = p.email.toLowerCase();
      upsert(email, {
        email,
        firmName: null,
        name: null,
        lastInvitedAt: p.createdAt.toISOString(),
        status: "email_sent",
        alreadyOnThisJob: clientJobId ? p.clientJobId === clientJobId : false,
      });
    }

    const suggestions = Array.from(byEmail.values()).sort((a, b) =>
      b.lastInvitedAt.localeCompare(a.lastInvitedAt)
    );

    return NextResponse.json(suggestions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
