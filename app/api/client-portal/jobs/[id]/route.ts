import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";
import { requireAdminResponse } from "@/lib/permissions";
import { safeErrorMessage } from "@/lib/safe-error";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const body = await request.json();

    // Verify job belongs to this client AND the caller can see it.
    // Editing a JO they shouldn't see leaks both existence and
    // content, so we 404 the same way the list would.
    const existing = await prisma.clientJob.findFirst({
      where: { id, clientId: ctx.clientId },
      include: { members: { select: { clientUserId: true } } },
    });

    if (!existing || !canAccessClientJob(ctx, existing)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Refuse to edit content the agency owns. The client team still
    // owns their internal notes (Comment.clientJobId) so those keep
    // their own write path — only the search-itself fields are off
    // limits here.
    if (existing.createdByAgency) {
      return NextResponse.json(
        {
          error:
            "This search was set up by your recruiting firm. Ask them to edit the search itself.",
        },
        { status: 403 }
      );
    }

    // Notes can come through as null / empty to clear the field, so
    // resolve them outside the spread to keep the "?? existing.x"
    // pattern from re-introducing the old value when the user blanks
    // the textarea. Capped at 10000 chars defensively.
    let nextNotes: string | null = existing.notes;
    if (body.notes !== undefined) {
      if (body.notes === null || body.notes === "") {
        nextNotes = null;
      } else if (typeof body.notes === "string") {
        nextNotes = body.notes.slice(0, 10_000);
      }
    }

    const updated = await prisma.clientJob.update({
      where: { id },
      data: {
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        requirements: body.requirements ?? existing.requirements,
        notes: nextNotes,
        location: body.location ?? existing.location,
        salaryRange: body.salaryRange ?? existing.salaryRange,
        salaryCurrency: body.salaryCurrency ?? existing.salaryCurrency,
        jobType: body.jobType ?? existing.jobType,
        isRemote: body.workMode ? body.workMode !== "ON_SITE" : existing.isRemote,
        status: body.status ?? existing.status,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const forbidden = requireAdminResponse(ctx.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    // Refuse to delete agency-mirrored jobs. The agency owns the
    // lifecycle; if the client doesn't want to see it they should
    // ask their recruiter to close the engagement instead.
    const existing = await prisma.clientJob.findFirst({
      where: { id, clientId: ctx.clientId },
      select: { createdByAgency: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (existing.createdByAgency) {
      return NextResponse.json(
        {
          error:
            "This search was set up by your recruiting firm. Ask them to close it.",
        },
        { status: 403 }
      );
    }

    await prisma.clientJob.deleteMany({
      where: { id, clientId: ctx.clientId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
