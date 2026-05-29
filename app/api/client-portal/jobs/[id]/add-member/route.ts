import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";
import { canAccessClientJob } from "@/lib/client-job-access";
import { randomBytes } from "crypto";
import {
  sendClientTeamInviteEmail,
  sendClientJobAccessGrantedEmail,
} from "@/lib/email";

// Add a member to a specific ClientJob from the "Your Team" panel on
// the job page. Three intent paths, all returned as one call:
//
//   1. Email is brand new on this client team
//      → create ClientUser + create ClientJobMember + send the
//        set-password invite. Note: gives them this Job's access on
//        signup. They still have to be added separately to other Jobs.
//   2. Email matches an existing ClientUser without access to this Job
//      → just create the ClientJobMember + send the "you were added
//        to <Job>" notification email. No set-password — they already
//        have a portal account.
//   3. Email matches an existing ClientUser who already has access
//      → 200 noop with a friendly message. Re-clicking should be safe.
//
// Domain match guard (mirrors /api/client-portal/team) so a random
// outside email can't be silently pulled in. ADMINs can override the
// domain check if needed — they're the ones who'd want to invite a
// consultant from a different domain.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getClientContext();
    const { id } = await params;
    const body = await request.json();

    const job = await prisma.clientJob.findFirst({
      where: { id, clientId: ctx.clientId },
      include: { members: { select: { clientUserId: true } } },
    });
    if (!job || !canAccessClientJob(ctx, job)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() || null : null;
    if (!email || !name) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    // Domain match. ADMINs bypass — they can pull in a consultant or
    // contact from a different domain when needed; non-admins are
    // capped to their own.
    if (ctx.role !== "ADMIN") {
      const inviter = await prisma.clientUser.findUnique({
        where: { id: ctx.clientUserId },
        select: { email: true },
      });
      const inviterDomain = inviter?.email?.split("@")[1]?.toLowerCase();
      const inviteeDomain = email.split("@")[1]?.toLowerCase();
      if (!inviterDomain || !inviteeDomain || inviterDomain !== inviteeDomain) {
        return NextResponse.json(
          {
            error: `You can only add teammates at @${inviterDomain || "your company"}. Ask an admin to add an external contact.`,
          },
          { status: 403 }
        );
      }
    }

    const client = await prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { name: true },
    });
    const inviter = await prisma.clientUser.findUnique({
      where: { id: ctx.clientUserId },
      select: { name: true },
    });

    // Path 2/3: existing ClientUser at THIS Client?
    const existing = await prisma.clientUser.findFirst({
      where: { email, clientId: ctx.clientId },
      select: { id: true, name: true, isActive: true },
    });

    if (existing) {
      // Already a member of this Job → noop.
      const alreadyMember = await prisma.clientJobMember.findFirst({
        where: { clientJobId: id, clientUserId: existing.id },
        select: { id: true },
      });
      if (alreadyMember) {
        return NextResponse.json(
          { mode: "noop", message: "Already on this search." },
          { status: 200 }
        );
      }

      await prisma.clientJobMember.create({
        data: { clientJobId: id, clientUserId: existing.id },
      });

      // Email + in-app notification — they already have a portal
      // account, so just point them to the new Job.
      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
      const jobUrl = `${baseUrl}/client-portal/jobs/${id}`;
      try {
        await sendClientJobAccessGrantedEmail({
          to: email,
          memberName: existing.name,
          inviterName: inviter?.name || "A teammate",
          companyName: client?.name || "your team",
          jobTitle: job.title,
          jobUrl,
        });
      } catch (e) {
        console.error("[add-member] grant email failed:", e);
      }
      try {
        await prisma.clientNotification.create({
          data: {
            clientId: ctx.clientId,
            clientUserId: existing.id,
            type: "job_access_granted",
            title: `${inviter?.name || "A teammate"} added you to ${job.title}`,
            body: "Open the search to review shared candidates.",
            link: `/client-portal/jobs/${id}`,
          },
        });
      } catch (e) {
        console.error("[add-member] grant in-app failed:", e);
      }

      return NextResponse.json(
        { mode: "granted", clientUserId: existing.id },
        { status: 200 }
      );
    }

    // Path 1: brand new email. Spin up ClientUser + grant job access
    // + send the set-password invite. The invite mail mentions which
    // team they were added to but not which specific Job — the same
    // template is reused for /api/client-portal/team. Future polish:
    // a JD-aware variant.
    const clientUser = await prisma.clientUser.create({
      data: {
        email,
        name,
        title,
        clientId: ctx.clientId,
        role: "USER",
      },
    });
    await prisma.clientJobMember.create({
      data: { clientJobId: id, clientUserId: clientUser.id },
    });

    const token = randomBytes(32).toString("hex");
    await prisma.clientPortalToken.create({
      data: {
        token,
        clientId: ctx.clientId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const inviteUrl =
      `${baseUrl}/client-portal/set-password?token=${token}` +
      `&email=${encodeURIComponent(email)}` +
      `&callbackUrl=${encodeURIComponent(`/client-portal/jobs/${id}`)}`;

    try {
      await sendClientTeamInviteEmail({
        to: email,
        inviteUrl,
        inviterName: inviter?.name || "A teammate",
        companyName: client?.name || "your team",
        memberName: name,
        title: title || undefined,
      });
    } catch (e) {
      console.error("[add-member] invite email failed:", e);
    }

    return NextResponse.json(
      { mode: "invited", clientUserId: clientUser.id, inviteUrl },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
