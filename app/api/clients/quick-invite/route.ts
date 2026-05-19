import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { DEFAULT_STAGES } from "@/lib/constants";
import { sendClientSetPasswordEmail } from "@/lib/email";

// Turn "jane@acme-corp.com" → "Acme Corp". The hiring manager will
// overwrite this on first login, so we just want something readable
// in the meantime (and avoid an empty / duplicate Client.name).
function deriveCompanyNameFromEmail(email: string): string {
  const domain = email.split("@")[1] || "";
  const base = domain.split(".")[0] || domain;
  if (!base) return "New Client";
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Quick-share path used by Job /new: agency types ONLY the hiring contact's
// email. We create a stub Client (just enough to attach Jobs to), a
// ClientUser, a set-password token, and email the invite. The hiring
// manager fills in real company info on first login — see
// /api/client-portal/register, which clears the isStub flag.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const rawEmail = typeof body?.hiringContactEmail === "string" ? body.hiringContactEmail.trim().toLowerCase() : "";
    const contactName = typeof body?.hiringContactName === "string" ? body.hiringContactName.trim() : "";

    if (!rawEmail || !/^\S+@\S+\.\S+$/.test(rawEmail)) {
      return NextResponse.json({ error: "A valid hiring contact email is required" }, { status: 400 });
    }

    const derivedName = deriveCompanyNameFromEmail(rawEmail);

    // If we already have a stub Client in this org tied to the same
    // hiring email, reuse it rather than spawning duplicates. (Real,
    // user-curated Clients are never reused — the agency may have
    // intentionally split contacts across accounts.)
    const existingStub = await prisma.client.findFirst({
      where: {
        organizationId: ctx.organizationId,
        isStub: true,
        contactEmail: rawEmail,
      },
      select: { id: true, name: true },
    });

    let clientId: string;
    let clientName: string;

    if (existingStub) {
      clientId = existingStub.id;
      clientName = existingStub.name;
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            name: derivedName,
            isStub: true,
            organizationId: ctx.organizationId,
            contactEmail: rawEmail,
            contactName: contactName || null,
          },
        });

        await tx.clientPipelineStage.createMany({
          data: DEFAULT_STAGES.map((s, i) => ({
            name: s.name,
            order: i,
            color: s.color,
            isTerminal: s.isTerminal,
            kind: s.kind,
            clientId: client.id,
          })),
        });

        return client;
      });
      clientId = created.id;
      clientName = created.name;
    }

    // Ensure a ClientUser exists for this email under this Client.
    // Copy password from any prior account on another Client so they
    // can sign in immediately if they already have one (same pattern
    // used by /api/client-portal/tokens).
    let clientUser = await prisma.clientUser.findFirst({
      where: { email: rawEmail, clientId },
    });
    if (!clientUser) {
      const existingElsewhere = await prisma.clientUser.findFirst({
        where: { email: rawEmail, passwordHash: { not: null } },
        select: { passwordHash: true },
      });
      clientUser = await prisma.clientUser.create({
        data: {
          email: rawEmail,
          name: contactName || rawEmail.split("@")[0],
          clientId,
          role: "ADMIN",
          passwordHash: existingElsewhere?.passwordHash || undefined,
        },
      });
    }

    // Only send a set-password email if they don't already have one.
    // If they do, the share notification will be sent later by the
    // Job-share flow (or they can just log in). The point of quick-
    // invite is to unblock the agency from creating the Job.
    if (!clientUser.passwordHash) {
      const baseUrl =
        process.env.NEXTAUTH_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const setPasswordToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.clientPortalToken.create({
        data: {
          token: setPasswordToken,
          clientId,
          expiresAt,
          isActive: true,
        },
      });

      const setPasswordUrl = `${baseUrl}/client-portal/set-password?token=${setPasswordToken}&email=${encodeURIComponent(rawEmail)}`;

      try {
        await sendClientSetPasswordEmail({
          to: rawEmail,
          setPasswordUrl,
          clientName: clientUser.name,
        });
      } catch (e) {
        console.error("[quick-invite] set-password email failed:", e);
      }
    }

    return NextResponse.json({ clientId, clientName, isStub: true, invited: !clientUser.passwordHash }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.message?.startsWith("Unauthorized") ? 401 : 500 });
  }
}
