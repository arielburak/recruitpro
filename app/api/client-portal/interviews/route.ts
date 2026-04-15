import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientContext();
    const { searchParams } = request.nextUrl;
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    // Find all interviews for jobs belonging to this client
    const where: any = {
      job: { clientId: ctx.clientId },
    };

    if (start || end) {
      where.startTime = {};
      if (start) where.startTime.gte = new Date(start);
      if (end) where.startTime.lte = new Date(end);
    }

    const interviews = await prisma.interview.findMany({
      where,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        type: true,
        status: true,
        meetingLink: true,
        location: true,
        timezone: true,
        candidate: {
          select: { firstName: true, lastName: true },
        },
        job: {
          select: { title: true },
        },
      },
      orderBy: { startTime: "asc" },
    });

    const result = interviews.map((i) => ({
      id: i.id,
      title: i.title,
      startTime: i.startTime,
      endTime: i.endTime,
      type: i.type,
      status: i.status,
      meetingLink: i.meetingLink,
      location: i.location,
      timezone: i.timezone,
      candidateName: `${i.candidate.firstName} ${i.candidate.lastName}`,
      jobTitle: i.job.title,
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
