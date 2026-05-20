import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { DEFAULT_STAGES } from "@/lib/constants";

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
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as "candidates" | "clients" | "jobs";
    const mappingRaw = formData.get("mapping");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!type || !FIELD_SPEC[type]) {
      return NextResponse.json({ error: "Invalid import type" }, { status: 400 });
    }

    // Optional mapping: { atsField: csvHeader | null }. When present,
    // a record's atsField value is read from record[csvHeader] — bypassing
    // the legacy hard-coded fallbacks. When absent, we fall back to the
    // old heuristic so existing callers (e.g. template imports) keep
    // working.
    let mapping: Record<string, string | null> | null = null;
    if (mappingRaw && typeof mappingRaw === "string") {
      try {
        mapping = JSON.parse(mappingRaw);
      } catch {
        return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 });
      }
      // Required fields must be mapped to something.
      const missing = FIELD_SPEC[type]
        .filter((f) => f.required && !mapping![f.key])
        .map((f) => f.key);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Required field${missing.length === 1 ? "" : "s"} not mapped: ${missing.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const text = await file.text();
    let records: any[] = [];

    if (file.name.toLowerCase().endsWith(".json")) {
      records = JSON.parse(text);
      if (!Array.isArray(records)) records = [records];
    } else {
      records = parseDelimited(text);
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
    const errors: string[] = [];

    if (type === "candidates") {
      for (const record of records) {
        try {
          const firstName = pick(record, "firstName", ["firstName", "first_name", "First Name"]) || "";
          const lastName = pick(record, "lastName", ["lastName", "last_name", "Last Name"]) || "";

          if (!firstName && !lastName) {
            skipped++;
            continue;
          }

          await prisma.candidate.create({
            data: {
              firstName,
              lastName,
              email: pick(record, "email", ["email", "Email", "E-mail"]),
              phone: pick(record, "phone", ["phone", "Phone", "Phone Number"]),
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
        } catch (e: any) {
          skipped++;
          if (errors.length < 5) errors.push(e.message);
        }
      }
    } else if (type === "clients") {
      for (const record of records) {
        try {
          const name = pick(record, "name", ["name", "Name", "Company Name"]) || "";
          if (!name) { skipped++; continue; }

          await prisma.client.create({
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
          imported++;
        } catch (e: any) {
          skipped++;
          if (errors.length < 5) errors.push(e.message);
        }
      }
    } else if (type === "jobs") {
      for (const record of records) {
        try {
          const title = pick(record, "title", ["title", "Title", "Job Title"]) || "";
          const clientName = pick(record, "client", ["client", "Client", "Client Name"]) || "";
          if (!title) { skipped++; continue; }

          let clientId: string | null = null;
          if (clientName) {
            const client = await prisma.client.findFirst({
              where: { name: { contains: clientName, mode: "insensitive" }, organizationId: ctx.organizationId },
            });
            clientId = client?.id ?? null;
          }

          if (!clientId) {
            const newClient = await prisma.client.create({
              data: { name: clientName || "Unknown Client", organizationId: ctx.organizationId },
            });
            clientId = newClient.id;
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
        } catch (e: any) {
          skipped++;
          if (errors.length < 5) errors.push(e.message);
        }
      }
    }

    return NextResponse.json({ imported, skipped, total: records.length, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Detect the delimiter from the first line — `\t` if more tabs than
// commas, comma otherwise. Lets one parser handle both CSV and TSV
// without making the UI ask which one.
function parseDelimited(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map((l) => l).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const first = lines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const delim = tabCount > commaCount ? "\t" : ",";

  const headers = parseLine(lines[0], delim);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delim);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h.trim()] = (values[idx] || "").trim();
    });
    records.push(record);
  }

  return records;
}

function parseLine(line: string, delim: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delim && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseSkillsField(skills: string | string[]): string[] {
  if (Array.isArray(skills)) return skills;
  if (!skills) return [];
  return skills.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}
