import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { DEFAULT_STAGES } from "@/lib/constants";
import { sendClientSetPasswordEmail } from "@/lib/email";
import { requireVerifiedEmail } from "@/lib/require-verified-email";

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

// Quick-share path used by Job /new: agency types ONLY the hiring
// contact's email. With the shared-Client model in place we handle
// three cases:
//
//   1. Email matches a ClientUser whose Client THIS agency is
//      already engaged with → reuse silently (return the existing
//      clientId so the new Job attaches to the right Client; no
//      new mail since the contact is already in flight).
//
//   2. Email matches a ClientUser at a Client we're NOT engaged
//      with yet (could be a totally new Acme record in the system,
//      or the same Acme another agency is also working with) →
//      transparently engage with that Client. The hiring company
//      lives once globally; we just need an OrganizationClient row
//      to make it visible on this agency's roster. No new mail —
//      the recipient already has a portal account.
//
//   3. Brand-new email → create stub Client + ClientUser + the
//      engagement, send the set-password invite.
export async function POST(request: Request) {
  try {
    const guard = await requireVerifiedEmail();
    if (guard) return guard;

    const ctx = await getOrgContext();
    const body = await request.json();
    const rawEmail =
      typeof body?.hiringContactEmail === "string"
        ? body.hiringContactEmail.trim().toLowerCase()
        : "";
    const contactName =
      typeof body?.hiringContactName === "string"
        ? body.hiringContactName.trim()
        : "";

    if (!rawEmail || !/^\S+@\S+\.\S+$/.test(rawEmail)) {
      return NextResponse.json(
        { error: "A valid hiring contact email is required" },
        { status: 400 }
      );
    }

    const existingCu = await prisma.clientUser.findUnique({
      where: { email: rawEmail },
      select: {
        id: true,
        name: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
    });

    if (existingCu) {
      // Ensure this agency is engaged with the hiring company. If
      // they already are, this is a no-op via the unique constraint.
      await prisma.organizationClient.upsert({
        where: {
          organizationId_clientId: {
            organizationId: ctx.organizationId,
            clientId: existingCu.clientId,
          },
        },
        update: {},
        create: {
          organizationId: ctx.organizationId,
          clientId: existingCu.clientId,
        },
      });

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

    // Reuse an existing stub Client this agency already created for
    // this hiring email (prevents duplicates when the recruiter
    // retries quick-share without picking up the previous invite).
    const existingStub = await prisma.client.findFirst({
      where: {
        engagedOrganizations: { some: { organizationId: ctx.organizationId } },
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
        // Engagement is now the source of visibility, not the audit
        // column on Client itself.
        await tx.organizationClient.create({
          data: {
            organizationId: ctx.organizationId,
            clientId: client.id,
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

    const clientUser = await prisma.clientUser.create({
      data: {
        email: rawEmail,
        name: contactName || rawEmail.split("@")[0],
        clientId,
        role: "ADMIN",
      },
    });

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

    // Pull the firm name para el greeting del email ("X has shared
    // candidates with you" en vez del fallback "A recruiting firm").
    let firmName: string | undefined = undefined;
    try {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      });
      firmName = org?.name || undefined;
    } catch {}

    try {
      await sendClientSetPasswordEmail({
        to: rawEmail,
        setPasswordUrl,
        clientName: clientUser.name,
        firmName,
      });
    } catch (e) {
      console.error("[quick-invite] set-password email failed:", e);
    }

    return NextResponse.json(
      { clientId, clientName, isStub: true, invited: true },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message?.startsWith("Unauthorized") ? 401 : 500 }
    );
  }
}
