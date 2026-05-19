import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext } from "@/lib/tenant";

// Checks an email against the agency-owned Contacts list for this
// client. Used by the team-invite form to pre-fill name/title when
// the person being invited already exists as a hiring-side contact.
export async function GET(request: Request) {
  try {
    const ctx = await getClientContext();

    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ match: null });
    }

    const contact = await prisma.contact.findFirst({
      where: {
        clientId: ctx.clientId,
        email: { equals: email, mode: "insensitive" },
      },
      select: {
        firstName: true,
        lastName: true,
        title: true,
        email: true,
      },
    });

    if (!contact) {
      return NextResponse.json({ match: null });
    }

    return NextResponse.json({
      match: {
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        title: contact.title,
        email: contact.email,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
