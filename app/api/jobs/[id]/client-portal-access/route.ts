import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendClientJobAccessGrantedEmail } from "@/lib/email";
import { canAccessJob } from "@/lib/job-access";

// Agency-side management of who, on the hiring company's portal, can
// see a specific Job. The flow on the client portal side
// (/api/client-portal/jobs/[id]/members) only lets the client team
// manage their own access; this endpoint is its counterpart for the
// recruiter — so a Job's access list can be edited from either side.
//
// Scope notes:
//   · Mirror must already exist. Creation flows (the "Invite Client to
//     Portal" dialog on the Job page) own the first-share, so this
//     endpoint focuses on the management side. Caller gets 400 with a
//     pointer when there's nothing to manage yet.
//   · No special creator treatment. The user can be added or removed
//     freely — from the agency POV the creator concept is irrelevant
//     ("just share the search with whoever needs to see it"). The
//     postedById FK on ClientJob stays as-is for audit, but doesn't
//     pin the creator to the members list.
//   · IDs are filtered against the mirror's clientId + active flag so
//     a hand-crafted payload can't grant cross-Client access.

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getOrgContext();
    const { id: jobId } = await params;

    if (!(await canAccessJob(jobId, ctx.organizationId, ctx.userId))) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId: ctx.organizationId },
      select: {
        title: true,
        client: { select: { id: true, name: true } },
        clientJobMirror: {
          select: {
            id: true,
            members: { select: { clientUserId: true } },
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!job.clientJobMirror) {
      return NextResponse.json(
        {
          error:
            "This job isn't shared with the client portal yet. Use Invite Client to share it first.",
        },
        { status: 400 },
      );
    }

    const body = await request.json();
    const rawIds: string[] = Array.isArray(body.memberIds)
      ? body.memberIds.filter((x: unknown): x is string => typeof x === "string")
      : [];

    const valid = rawIds.length
      ? await prisma.clientUser.findMany({
          where: { id: { in: rawIds }, clientId: job.client.id, isActive: true },
          select: { id: true, name: true, email: true },
        })
      : [];

    const previousIds = new Set(
      job.clientJobMirror.members.map((m) => m.clientUserId),
    );
    const finalIds = new Set(valid.map((v) => v.id));
    const newlyAdded = valid.filter((v) => !previousIds.has(v.id));

    const mirrorId = job.clientJobMirror.id;
    await prisma.$transaction([
      prisma.clientJobMember.deleteMany({ where: { clientJobId: mirrorId } }),
      ...(finalIds.size > 0
        ? [
            prisma.clientJobMember.createMany({
              data: Array.from(finalIds).map((cuId) => ({
                clientJobId: mirrorId,
                clientUserId: cuId,
              })),
            }),
          ]
        : []),
    ]);

    // Notify the newly-added users — same email + in-app pair the
    // client-portal side fires when someone is added there. Skips the
    // recruiter doing the share since they're on the agency side and
    // don't have a ClientUser row to notify against.
    if (newlyAdded.length > 0) {
      const baseUrl =
        process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
      const jobUrl = `${baseUrl}/client-portal/jobs/${mirrorId}`;
      const companyName = job.client.name || "your team";
      const inviterName = ctx.userName || "Your recruiter";
      const jobTitle = job.title || "this search";

      for (const u of newlyAdded) {
        try {
          await prisma.clientNotification.create({
            data: {
              clientId: job.client.id,
              clientUserId: u.id,
              type: "job_access_granted",
              title: `${inviterName} added you to ${jobTitle}`,
              body: "Open the search to review shared candidates.",
              link: `/client-portal/jobs/${mirrorId}`,
            },
          });
        } catch (e) {
          console.error("[agency members PUT] in-app notification failed:", e);
        }
        try {
          await sendClientJobAccessGrantedEmail({
            to: u.email,
            memberName: u.name,
            inviterName,
            companyName,
            jobTitle,
            jobUrl,
          });
        } catch (e) {
          console.error("[agency members PUT] grant email failed:", e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: finalIds.size,
      notified: newlyAdded.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
