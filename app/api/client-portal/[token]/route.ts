import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateClientPortalToken } from "@/lib/tokens";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenRecord = await validateClientPortalToken(token);

    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    const client = await prisma.client.findFirst({
      where: { id: tokenRecord.clientId },
      select: { name: true, id: true },
    });

    const jobWhere: any = {
      clientId: tokenRecord.clientId,
      submissions: { some: { isSharedWithClient: true } },
    };
    if (tokenRecord.jobId) jobWhere.id = tokenRecord.jobId;

    const jobs = await prisma.job.findMany({
      where: jobWhere,
      select: {
        id: true,
        title: true,
        status: true,
        location: true,
        salary: true,
        submissions: {
          where: { isSharedWithClient: true },
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                linkedIn: true,
                currentTitle: true,
                currentCompany: true,
                location: true,
                skills: true,
                summary: true,
                desiredSalary: true,
                documents: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    size: true,
                    createdAt: true,
                  },
                },
              },
            },
            stage: { select: { name: true, color: true } },
            ratings: {
              select: {
                score: true,
                feedback: true,
                clientUser: { select: { name: true } },
              },
            },
            comments: {
              where: { type: "CLIENT_VISIBLE" },
              select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { name: true } },
                clientUser: { select: { name: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    return NextResponse.json({ client, jobs, tokenId: tokenRecord.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
