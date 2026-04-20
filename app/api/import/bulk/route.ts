import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { DEFAULT_STAGES } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string; // candidates, clients, jobs

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    let records: any[] = [];

    // Parse CSV or JSON
    if (file.name.endsWith(".json")) {
      records = JSON.parse(text);
      if (!Array.isArray(records)) records = [records];
    } else {
      // CSV parsing
      records = parseCSV(text);
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "No records found in file" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (type === "candidates") {
      for (const record of records) {
        try {
          const firstName = record.firstName || record.first_name || record["First Name"] || "";
          const lastName = record.lastName || record.last_name || record["Last Name"] || "";

          if (!firstName && !lastName) {
            skipped++;
            continue;
          }

          await prisma.candidate.create({
            data: {
              firstName,
              lastName,
              email: record.email || record.Email || record["E-mail"] || null,
              phone: record.phone || record.Phone || record["Phone Number"] || null,
              linkedIn: record.linkedIn || record.linkedin || record.LinkedIn || null,
              location: record.location || record.Location || record.City || null,
              currentTitle: record.title || record.currentTitle || record.Title || record["Job Title"] || null,
              currentCompany: record.company || record.currentCompany || record.Company || record["Current Company"] || null,
              source: record.source || record.Source || "Import",
              summary: record.summary || record.notes || record.Summary || record.Notes || null,
              skills: parseSkillsField(record.skills || record.Skills || ""),
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
          const name = record.name || record.Name || record["Company Name"] || "";
          if (!name) { skipped++; continue; }

          await prisma.client.create({
            data: {
              name,
              industry: record.industry || record.Industry || null,
              website: record.website || record.Website || null,
              contactName: record.contactName || record["Contact Name"] || null,
              contactEmail: record.contactEmail || record["Contact Email"] || null,
              contactPhone: record.contactPhone || record["Contact Phone"] || null,
              notes: record.notes || record.Notes || null,
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
          const title = record.title || record.Title || record["Job Title"] || "";
          const clientName = record.client || record.Client || record["Client Name"] || "";
          if (!title) { skipped++; continue; }

          // Find or skip client
          let clientId = null;
          if (clientName) {
            const client = await prisma.client.findFirst({
              where: { name: { contains: clientName, mode: "insensitive" }, organizationId: ctx.organizationId },
            });
            clientId = client?.id;
          }

          if (!clientId) {
            // Create a placeholder client
            const newClient = await prisma.client.create({
              data: { name: clientName || "Unknown Client", organizationId: ctx.organizationId },
            });
            clientId = newClient.id;
          }

          const job = await prisma.job.create({
            data: {
              title,
              description: record.description || record.Description || null,
              status: "OPEN",
              clientId,
              organizationId: ctx.organizationId,
              salary: record.salary || record.Salary || null,
              location: record.location || record.Location || null,
            },
          });

          // Create the canonical 9 pipeline stages
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

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h.trim()] = values[idx]?.trim() || "";
    });
    records.push(record);
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
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
  return skills.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}
