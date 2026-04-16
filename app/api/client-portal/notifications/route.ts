import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// GET — list notifications + unread count
export async function GET(request: Request) {
  try {
    const ctx = await getClientContext();
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    const where: any = { clientId: ctx.clientId };
    if (unreadOnly) where.readAt = null;

    const [notifications, unreadCount] = await Promise.all([
      prisma.clientNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          submissionId: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.clientNotification.count({
        where: { clientId: ctx.clientId, readAt: null },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

// POST — mark all as read (body: { all: true }) or specific ids { ids: [...] }
export async function POST(request: Request) {
  try {
    const ctx = await getClientContext();
    const body = await request.json();

    if (body.all === true) {
      await prisma.clientNotification.updateMany({
        where: { clientId: ctx.clientId, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      await prisma.clientNotification.updateMany({
        where: { clientId: ctx.clientId, id: { in: body.ids } },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Nothing to mark" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
