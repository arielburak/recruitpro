import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { DEFAULT_STAGES } from "@/lib/constants";
import { parseSpreadsheetFile } from "@/lib/parse-spreadsheet";

// Per-type list of ATS fields the mapping UI lets the user wire up.
// Mirrored on the client so the field list stays in one place
// (lib/import-fields.ts). Required fields are validated server-side
// before we even start iterating, so a malformed mapping fails fast.
const FIELD_SPEC: Record<
  "candidates" | "clients" | "jobs",
  { key: string; required?: boolean }[]
> = {
  candidates: [
    { key: "firstName", required: true },
    { key: "lastName", required: true },
    { key: "email" },
    { key: "phone" },
    { key: "linkedIn" },
    { key: "location" },
    { key: "currentTitle" },
    { key: "currentCompany" },
    { key: "source" },
    { key: "summary" },
    { key: "skills" },
  ],
  clients: [
    { key: "name", required: true },
    { key: "industry" },
    { key: "website" },
    { key: "contactName" },
    { key: "contactEmail" },
    { key: "contactPhone" },
    { key: "notes" },
  ],
  jobs: [
    { key: "title", required: true },
    { key: "client" },
    { key: "description" },
    { key: "salary" },
    { key: "location" },
  ],
};

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();

    // Accept either:
    //   - JSON: { type, mapping, records } — parsed on the client.
    //     The recommended path for large imports because we sidestep
    //     Vercel's ~4.5MB multipart body cap; the client parses the
    //     spreadsheet (CSV / TSV / XLSX / JSON) and sends a slim
    //     records array.
    //   - multipart/form-data with `file`, `type`, `mapping`,
    //     `sheetName` — kept for backwards compatibility with the
    //     template downloads and any scripted callers.
    const contentType = request.headers.get("content-type") || "";

    let type: "candidates" | "clients" | "jobs" | undefined;
    let mapping: Record<string, string | null> | null = null;
    let records: any[] = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      type = body.type;
      mapping = body.mapping || null;
      records = Array.isArray(body.records) ? body.records : [];
      if (!type || !FIELD_SPEC[type]) {
        return NextResponse.json({ error: "Invalid import type" }, { status: 400 });
      }
    } else {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      type = formData.get("type") as "candidates" | "clients" | "jobs";
      const mappingRaw = formData.get("mapping");

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      if (!type || !FIELD_SPEC[type]) {
        return NextResponse.json({ error: "Invalid import type" }, { status: 400 });
      }

      if (mappingRaw && typeof mappingRaw === "string") {
        try {
          mapping = JSON.parse(mappingRaw);
        } catch {
          return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 });
        }
      }

      const sheetName = (formData.get("sheetName") as string | null) || null;
      const parsed = await parseSpreadsheetFile(file);
      const targetSheet =
        (sheetName && parsed.sheets.find((s) => s.name === sheetName)) ||
        parsed.sheets[0];
      if (!targetSheet) {
        return NextResponse.json({ error: "No sheet found in file" }, { status: 400 });
      }
      records = targetSheet.rows;
    }

    // Required-field validation runs regardless of how we got here.
    // When mapping is null we use the legacy header heuristics, so
    // there's nothing to validate.
    if (mapping) {
      const missing = FIELD_SPEC[type!]
        .filter((f) => f.required && !mapping![f.key])
        .map((f) => f.key);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Required field${missing.length === 1 ? "" : "s"} not mapped: ${missing.join(", ")}` },
          { status: 400 }
        );
      }
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "No records found in file" }, { status: 400 });
    }

    // Resolve a record's value for a given ATS field. With a mapping we
    // read mapping[atsField] as the CSV header to look up. Without one,
    // we fall back to the legacy union of likely header names.
    const pick = (record: any, atsField: string, legacyFallback: string[]): string | null => {
      if (mapping) {
        const header = mapping[atsField];
        if (!header) return null;
        const v = record[header];
        return v === undefined || v === "" ? null : String(v);
      }
      for (const k of legacyFallback) {
        if (record[k] !== undefined && record[k] !== "") return String(record[k]);
      }
      return null;
    };

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    // Jobs only: count of imported rows that share a (clientId, title)
    // with a pre-existing job. We don't auto-skip these — a recruiter
    // might be opening a second 'Senior Backend' at the same client
    // intentionally. Surfaced in the result panel as a soft warning
    // so the user can review without losing the import.
    let flagged = 0;
    const errors: string[] = [];

    if (type === "candidates") {
      // Pre-fetch existing candidates in this org keyed by lowercased
      // email and by firstName+lastName so the per-row create-or-skip
      // check is O(1). 6k candidates fit in memory comfortably; if we
      // ever push past that we can shard or batch-load.
      const existing = await prisma.candidate.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true },
      });
      const byEmail = new Map<string, true>();
      const byNamePhone = new Map<string, true>();
      const byName = new Map<string, true>();
      for (const c of existing) {
        if (c.email) byEmail.set(c.email.trim().toLowerCase(), true);
        const fullName = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
        if (c.phone) {
          byNamePhone.set(`${fullName}|${c.phone.replace(/\D/g, "")}`, true);
        }
        byName.set(fullName, true);
      }

      // Also dedupe within the file itself (a CSV can ship the same
      // candidate twice). Seed the seen-sets from the existing rows
      // so subsequent file rows respect both DB + file context.
      for (const record of records) {
        try {
          const firstName = pick(record, "firstName", ["firstName", "first_name", "First Name"]) || "";
          const lastName = pick(record, "lastName", ["lastName", "last_name", "Last Name"]) || "";

          if (!firstName && !lastName) {
            skipped++;
            continue;
          }

          const email = pick(record, "email", ["email", "Email", "E-mail"]);
          const phone = pick(record, "phone", ["phone", "Phone", "Phone Number"]);
          const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
          const emailKey = email ? email.trim().toLowerCase() : "";
          const phoneDigits = phone ? phone.replace(/\D/g, "") : "";

          // Dedup priority:
          //   1. Email (when present) — strongest signal.
          //   2. fullName + phone digits — handles people without
          //      an email but with a phone we can match.
          //   3. fullName alone — last-resort, only used to prevent
          //      file-internal duplicates (we DON'T treat same-name
          //      as a DB match because two people can share a name).
          if (emailKey && byEmail.has(emailKey)) { duplicates++; continue; }
          if (!emailKey && phoneDigits && byNamePhone.has(`${fullName}|${phoneDigits}`)) {
            duplicates++;
            continue;
          }

          await prisma.candidate.create({
            data: {
              firstName,
              lastName,
              email,
              phone,
              linkedIn: pick(record, "linkedIn", ["linkedIn", "linkedin", "LinkedIn"]),
              location: pick(record, "location", ["location", "Location", "City"]),
              currentTitle: pick(record, "currentTitle", ["title", "currentTitle", "Title", "Job Title"]),
              currentCompany: pick(record, "currentCompany", ["company", "currentCompany", "Company", "Current Company"]),
              source: pick(record, "source", ["source", "Source"]) || "Import",
              summary: pick(record, "summary", ["summary", "notes", "Summary", "Notes"]),
              skills: parseSkillsField(pick(record, "skills", ["skills", "Skills"]) || ""),
              tags: ["imported"],
              organizationId: ctx.organizationId,
              ownerId: ctx.userId,
            },
          });
          imported++;
          // Update the seen-sets so a second occurrence of the same
          // candidate later in the file gets de-duped against this
          // row we just inserted.
          if (emailKey) byEmail.set(emailKey, true);
          if (phoneDigits) byNamePhone.set(`${fullName}|${phoneDigits}`, true);
        } catch (e: any) {
          skipped++;
          if (errors.length < 5) errors.push(e.message);
        }
      }
    } else if (type === "clients") {
      // Pre-fetch clients already engaged with this agency, keyed by
      // lowercased name. Skipping by domain (the website) would be a
      // nice future improvement; for now name match is what we have.
      const existingClients = await prisma.client.findMany({
        where: {
          engagedOrganizations: { some: { organizationId: ctx.organizationId } },
        },
        select: { id: true, name: true },
      });
      const clientsByName = new Map<string, string>();
      for (const c of existingClients) {
        clientsByName.set(c.name.trim().toLowerCase(), c.id);
      }

      for (const record of records) {
        try {
          const name = pick(record, "name", ["name", "Name", "Company Name"]) || "";
          if (!name) { skipped++; continue; }

          const key = name.trim().toLowerCase();
          if (clientsByName.has(key)) {
            duplicates++;
            continue;
          }

          // Shared-Client model (PR #139): a Client is visible to an
          // agency only if there's an OrganizationClient row linking
          // them. Without it, the imported clients wouldn't show up
          // on /clients. Create both in one transaction so a failed
          // engagement insert doesn't leave the Client orphaned.
          const created = await prisma.$transaction(async (tx) => {
            const c = await tx.client.create({
              data: {
                name,
                industry: pick(record, "industry", ["industry", "Industry"]),
                website: pick(record, "website", ["website", "Website"]),
                contactName: pick(record, "contactName", ["contactName", "Contact Name"]),
                contactEmail: pick(record, "contactEmail", ["contactEmail", "Contact Email"]),
                contactPhone: pick(record, "contactPhone", ["contactPhone", "Contact Phone"]),
                notes: pick(record, "notes", ["notes", "Notes"]),
                organizationId: ctx.organizationId,
              },
            });
            await tx.organizationClient.create({
              data: { organizationId: ctx.organizationId, clientId: c.id },
            });
            return c;
          });
          imported++;
          clientsByName.set(key, created.id);
        } catch (e: any) {
          skipped++;
          if (errors.length < 5) errors.push(e.message);
        }
      }
    } else if (type === "jobs") {
      // Existing jobs for THIS agency, keyed by (clientId, lowercased
      // title). Same-title-at-same-client is the duplicate signal —
      // two jobs with the same title at different clients are
      // legitimately distinct. Per-org scope so another agency's job
      // with the same title doesn't show as duplicate here.
      const existingJobs = await prisma.job.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, title: true, clientId: true },
      });
      const jobKey = (clientId: string | null, title: string) =>
        `${clientId || ""}|${title.trim().toLowerCase()}`;
      const jobsSeen = new Set<string>();
      for (const j of existingJobs) {
        jobsSeen.add(jobKey(j.clientId, j.title));
      }

      for (const record of records) {
        try {
          const title = pick(record, "title", ["title", "Title", "Job Title"]) || "";
          const clientName = pick(record, "client", ["client", "Client", "Client Name"]) || "";
          if (!title) { skipped++; continue; }

          let clientId: string | null = null;
          if (clientName) {
            // Match within the agency's engaged clients (shared-Client
            // model). If we created the client a moment earlier in the
            // Clients sheet this finds it; falls through to the
            // create-and-engage branch below otherwise.
            const client = await prisma.client.findFirst({
              where: {
                name: { contains: clientName, mode: "insensitive" },
                engagedOrganizations: { some: { organizationId: ctx.organizationId } },
              },
            });
            clientId = client?.id ?? null;
          }

          if (!clientId) {
            // Same shared-Client engagement insert as the clients
            // import branch — without it the placeholder Client
            // would be invisible to the agency.
            const newClient = await prisma.$transaction(async (tx) => {
              const c = await tx.client.create({
                data: { name: clientName || "Unknown Client", organizationId: ctx.organizationId },
              });
              await tx.organizationClient.create({
                data: { organizationId: ctx.organizationId, clientId: c.id },
              });
              return c;
            });
            clientId = newClient.id;
          }

          // Dedup check now that we know which client the job is
          // pinned to. Same-title-at-same-client = duplicate; same
          // title at a different client is a separate job.
          // Jobs aren't auto-deduped: same (title, client) might be
          // a legitimate second search. We just flag it so the user
          // can review the result panel and clean up if they didn't
          // mean to. Re-uploads of the exact same file in one
          // session don't double-count — we track the seen-set
          // anyway and bump `flagged` only on the first collision.
          const key = jobKey(clientId, title);
          if (jobsSeen.has(key)) {
            flagged++;
          }

          const job = await prisma.job.create({
            data: {
              title,
              description: pick(record, "description", ["description", "Description"]),
              status: "OPEN",
              clientId,
              organizationId: ctx.organizationId,
              salary: pick(record, "salary", ["salary", "Salary"]),
              location: pick(record, "location", ["location", "Location"]),
            },
          });

          await prisma.pipelineStage.createMany({
            data: DEFAULT_STAGES.map((s, i) => ({
              name: s.name,
              color: s.color,
              isTerminal: s.isTerminal,
              kind: s.kind,
              order: i,
              jobId: job.id,
            })),
          });

          imported++;
          jobsSeen.add(key);
        } catch (e: any) {
          skipped++;
          if (errors.length < 5) errors.push(e.message);
        }
      }
    }

    return NextResponse.json({
      imported,
      duplicates,
      flagged,
      skipped,
      total: records.length,
      errors,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// CSV / TSV / XLSX parsing lives in lib/parse-spreadsheet now so the
// API and the UI preview share one source of truth.

function parseSkillsField(skills: string | string[]): string[] {
  if (Array.isArray(skills)) return skills;
  if (!skills) return [];
  return skills.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}
