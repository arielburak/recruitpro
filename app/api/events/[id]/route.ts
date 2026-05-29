import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Single calendar event CRUD. Same per-user scope as the list endpoint:
// only the creator can read / edit / delete their own events. No admin
// override — these are personal blocks, not org records.

// See /api/events/route.ts — MEETING removed, Interview model owns
// that use case. PUT rejects it on edits too so a legacy MEETING row
// can't be re-saved with the same kind via a stale client.
const ALLOWED_KINDS = new Set(["EVENT", "FOLLOW_UP", "REMINDER"]);
const ALLOWED_RECURRENCE = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

async function loadOwned(id: string, ctx: { organizationId: string; userId: string }) {
  return prisma.calendarEvent.findFirst({
    where: { id, organizationId: ctx.organizationId, createdBy: ctx.userId },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const event = await prisma.calendarEvent.findFirst({
      where: { id, organizationId: ctx.organizationId, createdBy: ctx.userId },
      include: {
        client: { select: { id: true, name: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        creator: { select: { id: true, name: true } },
      },
    });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(event);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const existing = await loadOwned(id, ctx);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const data: any = {};
    if (typeof body.title === "string") data.title = body.title;
    if ("description" in body) data.description = body.description || null;
    if (body.startTime) data.startTime = new Date(body.startTime);
    if (body.endTime) data.endTime = new Date(body.endTime);
    if ("allDay" in body) data.allDay = Boolean(body.allDay);
    if ("location" in body) data.location = body.location || null;
    if ("meetingLink" in body) data.meetingLink = body.meetingLink || null;
    if (typeof body.timezone === "string") data.timezone = body.timezone;
    if (typeof body.kind === "string" && ALLOWED_KINDS.has(body.kind)) data.kind = body.kind;
    if ("recurrence" in body) {
      // Outlook-style toggle on the form: null clears the series, a
      // known string sets the cadence. Anything else is ignored so a
      // typo can't silently break the expansion logic.
      data.recurrence =
        body.recurrence && ALLOWED_RECURRENCE.has(body.recurrence)
          ? body.recurrence
          : null;
      // Clearing recurrence resets the interval back to 1 so the next
      // toggle-on starts from a sane "every 1" default.
      if (data.recurrence === null) data.recurrenceInterval = 1;
    }
    if ("recurrenceInterval" in body) {
      const n = Number(body.recurrenceInterval);
      data.recurrenceInterval =
        Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    }
    if ("recurrenceEndDate" in body) {
      data.recurrenceEndDate = body.recurrenceEndDate
        ? new Date(body.recurrenceEndDate)
        : null;
    }

    // Optional relation re-assignment. Same org-scope guard as on POST.
    if ("clientId" in body) {
      if (body.clientId) {
        const c = await prisma.client.findFirst({
          where: { id: body.clientId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!c) return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      data.clientId = body.clientId || null;
    }
    if ("candidateId" in body) {
      if (body.candidateId) {
        const c = await prisma.candidate.findFirst({
          where: { id: body.candidateId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!c) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      }
      data.candidateId = body.candidateId || null;
    }
    if ("jobId" in body) {
      if (body.jobId) {
        const j = await prisma.job.findFirst({
          where: { id: body.jobId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!j) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      data.jobId = body.jobId || null;
    }

    const updated = await prisma.calendarEvent.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        creator: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Calendar event update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;
    const existing = await loadOwned(id, ctx);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
