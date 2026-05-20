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
// manager fills in real company info on first login.
//
// Email uniqueness (ClientUser.email is globally unique) means we
// need three distinct branches:
//   1. The email already belongs to a ClientUser whose Client is in
//      THIS agency's org → reuse silently, attach Jobs to that Client.
//   2. The email belongs to a ClientUser at another org's Client (a
//      competitor agency, or a self-signed-up hiring company) →
//      surface a clear 409 so the recruiter knows to use a different
//      address (the contact's personal / alt email).
//   3. Brand new email → create stub Client + ClientUser as before.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json();
    const rawEmail = typeof body?.hiringContactEmail === "string" ? body.hiringContactEmail.trim().toLowerCase() : "";
    const contactName = typeof body?.hiringContactName === "string" ? body.hiringContactName.trim() : "";

    if (!rawEmail || !/^\S+@\S+\.\S+$/.test(rawEmail)) {
      return NextResponse.json({ error: "A valid hiring contact email is required" }, { status: 400 });
    }

    // Branch 1/2: this email already has a ClientUser somewhere.
    const existingCu = await prisma.clientUser.findUnique({
      where: { email: rawEmail },
      select: {
        id: true,
        name: true,
        clientId: true,
        passwordHash: true,
        client: { select: { id: true, name: true, organizationId: true } },
      },
    });

    if (existingCu) {
      if (existingCu.client.organizationId !== ctx.organizationId) {
        return NextResponse.json(
          {
            error:
              "This email is already in use at another client / agency. Ask the contact for a different email (work or personal) you can use here.",
          },
          { status: 409 }
        );
      }
      // Same agency — reuse the existing Client + ClientUser. No
      // set-password email here because the recipient already has an
      // account in flight; the share flow will follow up.
      return NextResponse.json(
        {
          clientId: existingCu.clientId,
          clientName: existingCu.client.name,
          isStub: false,
          invited: false,
          reused: true,
        },
        { status: 200 }
      );
    }

    const derivedName = deriveCompanyNameFromEmail(rawEmail);

    // Branch 3: brand new email. Reuse an existing stub Client tied
    // to this hiring email if one was already created in this org
    // (prevents duplicates when the recruiter retries quick-share).
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

    // Fresh ClientUser for this email under the stub Client. Safe to
    // unique-create here because the early findUnique above already
    // ruled out a pre-existing row.
    const clientUser = await prisma.clientUser.create({
      data: {
        email: rawEmail,
        name: contactName || rawEmail.split("@")[0],
        clientId,
        role: "ADMIN",
      },
    });

    // Brand-new account → send set-password email so the hiring
    // manager can activate it. The share flow will land them on the
    // specific Job once they set a password.
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

    return NextResponse.json(
      { clientId, clientName, isStub: true, invited: true },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.message?.startsWith("Unauthorized") ? 401 : 500 });
  }
}
