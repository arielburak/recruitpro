import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();

    const comment = await prisma.comment.create({
      data: {
        content: body.content,
        type: body.type || "INTERNAL",
        candidateId: body.candidateId || null,
        submissionId: body.submissionId || null,
        userId: ctx.userId,
        mentions: body.mentions || [],
      },
      include: {
        user: { select: { name: true } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
