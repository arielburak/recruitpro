import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { sendJobAssignedEmail } from "@/lib/email";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Verify job belongs to org
    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const assignments = await prisma.jobAssignment.findMany({
      where: { jobId: id },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    return NextResponse.json(assignments);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Any authenticated org user can assign recruiters to jobs
    // (role-based restriction removed; simplified to Admin/User model)

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Verify job belongs to org. We pull title + client info up
    // front because we use them for the notification + email below.
    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        title: true,
        client: { select: { name: true } },
      },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // Verify user belongs to same org
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, name: true, email: true, title: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const assignment = await prisma.jobAssignment.create({
      data: { jobId: id, userId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    // Notify the newly-assigned recruiter (don't notify self-
    // assigns — opening your own job and clicking "assign me" is
    // already its own confirmation). Both in-app and mail per the
    // user's rule: "Notificación + mail al agregarme a un job".
    // Fire-and-forget so a flaky Resend doesn't fail the assign.
    if (userId !== ctx.userId) {
      const baseUrl =
        process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
      const jobUrl = `${baseUrl}/jobs/${id}`;
      const contextLine = [user.title, job.client?.name]
        .filter(Boolean)
        .join(" · ");

      void (async () => {
        try {
          await prisma.userNotification.create({
            data: {
              userId,
              type: "job_assigned",
              title: `${ctx.userName || "A teammate"} added you to ${job.title}`,
              body: contextLine || null,
              link: `/jobs/${id}`,
            },
          });
        } catch (e) {
          console.error("[assignments POST] in-app notification failed:", e);
        }
        if (user.email) {
          try {
            await sendJobAssignedEmail({
              to: user.email,
              recipientName: user.name || "",
              assignerName: ctx.userName || "A teammate",
              jobTitle: job.title,
              clientName: job.client?.name || null,
              role: user.title || null,
              jobUrl,
            });
          } catch (e) {
            console.error("[assignments POST] email failed:", e);
          }
        }
      })();
    }

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    // Handle duplicate assignment
    if (error.code === "P2002") {
      return NextResponse.json({ error: "User is already assigned to this job" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getOrgContext();
    const { id } = await params;

    // Any authenticated org user can remove assignments
    // (role-based restriction removed; simplified to Admin/User model)

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Verify job belongs to org
    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    await prisma.jobAssignment.deleteMany({
      where: { jobId: id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
