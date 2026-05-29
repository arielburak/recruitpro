import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

// Generic personal calendar events that live alongside Interviews on
// the /calendar grid. Outlook-style: follow-ups, reminders, internal
// blocks, team syncs. Per-user scope — only the creator sees their
// events; no invite mechanic, no email fan-out (Interviews are the
// only path the system ever uses to mail a candidate).
//
// Optional `clientId` / `candidateId` / `jobId` let the recruiter
// attach the event to a CRM entity for context ("FU with Acme" /
// "Touch base with John Doe" / "Weekly sync on Sales VP search").
// All three are nullable so pure personal blocks work too.

const ALLOWED_KINDS = new Set(["EVENT", "FOLLOW_UP", "REMINDER", "MEETING"]);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const sp = request.nextUrl.searchParams;
    const start = sp.get("start");
    const end = sp.get("end");

    const where: any = {
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    };
    if (start && end) {
      where.startTime = { gte: new Date(start), lte: new Date(end) };
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json(events);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const {
      title,
      description,
      startTime,
      endTime,
      allDay,
      location,
      meetingLink,
      timezone,
      kind,
      clientId,
      candidateId,
      jobId,
    } = body;

    if (!title || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Title, start, and end are required" },
        { status: 400 }
      );
    }

    // Cheap org-scope guard: if the recruiter passed a relation id,
    // confirm it actually belongs to their org before saving. Avoids a
    // hand-crafted payload sneaking a cross-org link in.
    if (clientId) {
      const c = await prisma.client.findFirst({
        where: { id: clientId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!c) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    if (candidateId) {
      const c = await prisma.candidate.findFirst({
        where: { id: candidateId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!c) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (jobId) {
      const j = await prisma.job.findFirst({
        where: { id: jobId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!j) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title,
        description: description || null,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        allDay: Boolean(allDay),
        location: location || null,
        meetingLink: meetingLink || null,
        timezone: timezone || "America/Argentina/Buenos_Aires",
        kind: ALLOWED_KINDS.has(kind) ? kind : "EVENT",
        clientId: clientId || null,
        candidateId: candidateId || null,
        jobId: jobId || null,
        organizationId: ctx.organizationId,
        createdBy: ctx.userId,
      },
      include: {
        client: { select: { id: true, name: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        creator: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    console.error("Calendar event create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
