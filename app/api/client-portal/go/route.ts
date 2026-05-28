import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Resolve an agency-side jobId to a concrete deep-link target for the
// client portal. Used by the /go redirect page that share emails point
// at — the email knows the agency Job id but the client portal only
// renders ClientJobs, so we look up the mirror created when the
// recruiter ran "Invite Client" on /jobs/[id].
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ path: "/client-portal/dashboard" });
    }

    // Mirror created by /api/client-portal/tokens at first-share. We
    // also check clientId so a client can't deep-link into another
    // hiring company's ClientJob by guessing a Job id.
    const mirror = await prisma.clientJob.findFirst({
      where: { sourceJobId: jobId, clientId: ctx.clientId },
      select: { id: true },
    });
    if (mirror) {
      return NextResponse.json({ path: `/client-portal/jobs/${mirror.id}` });
    }

    return NextResponse.json({ path: "/client-portal/dashboard" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
