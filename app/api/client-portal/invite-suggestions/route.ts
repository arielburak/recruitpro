import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

type Status = "accepted" | "pending" | "declined" | "email_sent";

type Suggestion = {
  // Stable dedupe key. For person-level rows this is the email; for
  // firm-only legacy rows there's no email to key on, so we fall back
  // to "firm::<firmName>". The UI uses this as React key.
  key: string;
  email: string | null;
  firmName: string | null;
  name: string | null;
  lastInvitedAt: string;
  // Tells the UI how to render this row (what pill to show). Reflects
  // the most recent status for this recruiter across all jobs at this
  // client — accepted-on-another-job is a stronger signal than pending,
  // etc.
  status: Status;
  // Legacy engagements pre-date person-level invites — we know the
  // firm but not who specifically was invited. The UI uses this to
  // render them differently (firm name only, no email prefill).
  firmOnly: boolean;
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

    const [personEngagements, legacyEngagements, pending] = await Promise.all([
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
      // Legacy org-level invites (pre person-level schema). We surface
      // them so "Mora" still matches "Morabits" even when there's no
      // specific person on record — the UI shows them as firm-only
      // entries the user can reference while typing the real email.
      prisma.firmEngagement.findMany({
        where: {
          clientJob: { clientId: ctx.clientId },
          invitedEmail: null,
        },
        select: {
          clientJobId: true,
          invitedAt: true,
          status: true,
          organization: { select: { name: true } },
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
    // "already on this job" flag across all rows for the same key.
    // Person rows key on email; firm-only legacy rows key on
    // "firm::<firmName>" so multiple legacy engagements with the same
    // firm collapse into a single suggestion.
    const byKey = new Map<string, Suggestion>();

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

    function upsert(key: string, hit: Suggestion) {
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, hit);
        return;
      }
      // Prefer the more-recent row as the base, but keep the highest-
      // ranked status we've seen and OR the already-on-this-job flag.
      const base = hit.lastInvitedAt > existing.lastInvitedAt ? hit : existing;
      const topStatus =
        rank[hit.status] >= rank[existing.status] ? hit.status : existing.status;
      byKey.set(key, {
        ...base,
        firmName: base.firmName || existing.firmName || hit.firmName,
        name: base.name || existing.name || hit.name,
        // Once we have a person-level row for a firm, it wins over
        // firm-only (a named contact is strictly more useful than an
        // anonymous firm entry).
        firmOnly: base.firmOnly && existing.firmOnly,
        status: topStatus,
        alreadyOnThisJob: existing.alreadyOnThisJob || hit.alreadyOnThisJob,
      });
    }

    for (const e of personEngagements) {
      const email = (e.invitedEmail || "").toLowerCase();
      if (!email) continue;
      upsert(email, {
        key: email,
        email,
        firmName: e.organization.name || null,
        name: e.invitedUser?.name || null,
        lastInvitedAt: e.invitedAt.toISOString(),
        status: statusOf(e.status),
        firmOnly: false,
        alreadyOnThisJob: clientJobId ? e.clientJobId === clientJobId : false,
      });
    }

    for (const p of pending) {
      const email = p.email.toLowerCase();
      upsert(email, {
        key: email,
        email,
        firmName: null,
        name: null,
        lastInvitedAt: p.createdAt.toISOString(),
        status: "email_sent",
        firmOnly: false,
        alreadyOnThisJob: clientJobId ? p.clientJobId === clientJobId : false,
      });
    }

    // Legacy firm-only entries go in last. If a person-level row for
    // the same firm already exists, the upsert keeps the person-level
    // data — the firm-only entry is effectively absorbed.
    for (const e of legacyEngagements) {
      const firmName = e.organization.name || null;
      if (!firmName) continue;
      const firmKey = `firm::${firmName.toLowerCase()}`;
      // If we already have any person-level row for this firm, skip —
      // the person row is strictly more informative. This keeps the
      // legacy section from duplicating data the user can already act
      // on.
      const personForFirm = Array.from(byKey.values()).some(
        (s) => !s.firmOnly && s.firmName?.toLowerCase() === firmName.toLowerCase()
      );
      if (personForFirm) continue;
      upsert(firmKey, {
        key: firmKey,
        email: null,
        firmName,
        name: null,
        lastInvitedAt: e.invitedAt.toISOString(),
        status: statusOf(e.status),
        firmOnly: true,
        alreadyOnThisJob: false, // firm-only rows can't be "on this job" at the person level
      });
    }

    const suggestions = Array.from(byKey.values()).sort((a, b) =>
      b.lastInvitedAt.localeCompare(a.lastInvitedAt)
    );

    return NextResponse.json(suggestions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
