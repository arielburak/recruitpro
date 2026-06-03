import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Resolve an agency-side jobId to a concrete deep-link target for the
// client portal. Used by:
//   - the /go redirect page that share emails point at
//   - the /client-portal/jobs/[id] page as a fallback when a stale
//     notification link still carries the agency Job.id instead of
//     the ClientJob.id (we used to ship that bug before the
//     tokens.ts and chat-notifications.ts fixes landed)
//
// Two resolution paths, both scoped to ctx.clientId so guessing a
// random Job id can't leak someone else's search:
//   1. ClientJob.sourceJobId === jobId  (mirror created by
//      /api/client-portal/tokens at first-share)
//   2. FirmEngagement.jobId === jobId   (engagement accepted by
//      the recruiting firm; the ClientJob predates the Job)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ path: "/client-portal/dashboard" });
    }

    const mirror = await prisma.clientJob.findFirst({
      where: { sourceJobId: jobId, clientId: ctx.clientId },
      select: { id: true },
    });
    if (mirror) {
      return NextResponse.json({ path: `/client-portal/jobs/${mirror.id}` });
    }

    // Fallback: the ClientJob may predate the agency Job (the
    // engagement flow goes ClientJob → invite firm → Job). Find
    // any accepted engagement whose jobId matches and use its
    // clientJobId.
    const engagement = await prisma.firmEngagement.findFirst({
      where: {
        jobId,
        status: "ACCEPTED",
        clientJob: { clientId: ctx.clientId },
      },
      select: { clientJobId: true },
    });
    if (engagement) {
      return NextResponse.json({
        path: `/client-portal/jobs/${engagement.clientJobId}`,
      });
    }

    return NextResponse.json({ path: "/client-portal/dashboard" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
