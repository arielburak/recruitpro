import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { toCsv, csvResponse } from "@/lib/csv";

// Export contacts to CSV. Contacts are org-scoped via
// Contact.organizationId; we include the client they're attached to
// so the exported file is useful as a contact-book / mail-merge
// source.
export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];

    const where: any = { organizationId: ctx.organizationId };
    if (ids.length > 0) where.id = { in: ids };

    const contacts = await prisma.contact.findMany({
      where,
      include: { client: { select: { name: true } } },
      orderBy: [{ client: { name: "asc" } }, { lastName: "asc" }],
    });

    const rows = contacts.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      title: c.title || "",
      email: c.email || "",
      phone: c.phone || "",
      client: c.client?.name || "",
      isPrimary: c.isPrimary ? "yes" : "",
      createdAt: c.createdAt,
    }));

    const csv = toCsv(
      ["firstName", "lastName", "title", "email", "phone", "client", "isPrimary", "createdAt"],
      rows
    );
    return csvResponse(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (error: any) {
    return new Response(error.message || "Export failed", { status: 500 });
  }
}
