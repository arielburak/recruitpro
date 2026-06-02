/* eslint-disable no-console */
// Extends opencats-dump-to-csv: pulls candidates + companies + jobs
// from an OpenCATS MariaDB dump and writes ONE .xlsx workbook with
// one sheet per entity. The import wizard's multi-sheet picker
// (PR #148) surfaces all three; the user re-runs the wizard once
// per type (changing the type tab at the top) to pull each into
// the ATS.
//
// Run:
//   npx tsx scripts/opencats-dump-to-xlsx.ts <backup.sql> <output.xlsx> [limit]

import * as fs from "fs";
import * as XLSX from "xlsx";

// ── MySQL VALUES parser (shared with opencats-dump-to-csv) ──

function parseRow(rowText: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = rowText.length;
  while (i < n) {
    while (i < n && /\s/.test(rowText[i])) i++;
    if (i >= n) break;
    if (rowText[i] === "'") {
      i++;
      let s = "";
      while (i < n) {
        const c = rowText[i];
        if (c === "\\" && i + 1 < n) {
          const next = rowText[i + 1];
          if (next === "n") s += "\n";
          else if (next === "r") s += "\r";
          else if (next === "t") s += "\t";
          else s += next;
          i += 2;
          continue;
        }
        if (c === "'") {
          if (i + 1 < n && rowText[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += c;
        i++;
      }
      out.push(s);
    } else {
      let v = "";
      while (i < n && rowText[i] !== "," && rowText[i] !== ")") {
        v += rowText[i];
        i++;
      }
      v = v.trim();
      out.push(v === "NULL" ? "" : v);
    }
    while (i < n && /\s/.test(rowText[i])) i++;
    if (rowText[i] === ",") i++;
  }
  return out;
}

function splitTuples(block: string): string[] {
  // Walk the INSERT VALUES block tuple-by-tuple. Single-quoted
  // strings can contain parens; we have to track string state.
  const rows: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (inString) {
      current += c;
      if (c === "\\" && i + 1 < block.length) {
        current += block[i + 1];
        i++;
        continue;
      }
      if (c === "'") {
        if (i + 1 < block.length && block[i + 1] === "'") {
          current += "'";
          i++;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (c === "'") {
      inString = true;
      current += c;
      continue;
    }
    if (c === "(") {
      if (depth === 0) current = "";
      else current += c;
      depth++;
      continue;
    }
    if (c === ")") {
      depth--;
      if (depth === 0) {
        rows.push(current);
        current = "";
      } else {
        current += c;
      }
      continue;
    }
    if (depth > 0) current += c;
  }
  return rows;
}

function extractTable(sql: string, table: string): string[][] {
  const marker = `INSERT INTO \`${table}\` VALUES`;
  const idx = sql.indexOf(marker);
  if (idx < 0) return [];
  const end = sql.indexOf(";\n", idx);
  const block = sql.slice(idx + marker.length, end);
  return splitTuples(block).map(parseRow);
}

// Column orders per OpenCATS schema. Copied from the CREATE TABLE
// in the dump — used to index into each parsed row by name.
const CANDIDATE_COLS = [
  "candidate_id","site_id","last_name","first_name","middle_name",
  "phone_home","phone_cell","phone_work","address","city","state",
  "zip","source","date_available","can_relocate","notes","key_skills",
  "current_employer","entered_by","owner","date_created","date_modified",
  "email1","email2","web_site","import_id","is_hot","eeo_ethnic_type_id",
  "eeo_veteran_type_id","eeo_disability_status","eeo_gender","desired_pay",
  "current_pay","is_active","is_admin_hidden","best_time_to_call",
];

const COMPANY_COLS = [
  "company_id","site_id","name","address","city","state","zip","phone1",
  "phone2","url","key_technologies","is_hot","notes","entered_by","owner",
  "date_created","date_modified","fax_number","billing_contact",
  "import_id",
];

const JOBORDER_COLS = [
  "joborder_id","site_id","recruiter","contact_id","client_job_id",
  "company_id","title","description","notes","duration","rate_max",
  "salary","status","is_hot","type","department_id","entered_by","owner",
  "date_created","date_modified","start_date","city","state","openings",
  "openings_available","company_department_id","import_id","is_admin_hidden",
  "is_active","public","questionnaire_id","public_ad","display_name_id",
];

function pick(row: string[], cols: string[], col: string): string {
  const i = cols.indexOf(col);
  return i >= 0 ? row[i] || "" : "";
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const limit = process.argv[4] ? parseInt(process.argv[4], 10) : Infinity;

  if (!inputPath || !outputPath) {
    console.error("Usage: npx tsx scripts/opencats-dump-to-xlsx.ts <backup.sql> <output.xlsx> [limit]");
    process.exit(1);
  }

  const sql = fs.readFileSync(inputPath, "utf8");

  const candidateRows = extractTable(sql, "candidate").slice(0, limit);
  // Clients and jobs are small in any real dump (hundreds, not
  // thousands), so we always pull all of them. The `limit` arg only
  // caps candidates — the noisiest table — to keep demo files small.
  const companyRows = extractTable(sql, "company");
  const jobOrderRows = extractTable(sql, "joborder");

  // Build a company_id → name map so the joborder sheet can carry a
  // readable "client" column instead of the raw FK. The wizard's
  // jobs importer matches Client by name and creates it if missing.
  const companyIdToName = new Map<string, string>();
  for (const r of companyRows) {
    const id = pick(r, COMPANY_COLS, "company_id");
    const name = pick(r, COMPANY_COLS, "name");
    if (id && name) companyIdToName.set(id, name);
  }

  // ── candidates sheet ──
  const candidateHeaders = [
    "firstName","lastName","email","phone","linkedIn","location",
    "currentTitle","currentCompany","source","skills","summary",
  ];
  const candidateAoA: any[][] = [candidateHeaders];
  for (const r of candidateRows) {
    const firstName = pick(r, CANDIDATE_COLS, "first_name");
    const lastName = pick(r, CANDIDATE_COLS, "last_name");
    if (!firstName && !lastName) continue;
    const email = pick(r, CANDIDATE_COLS, "email1") || pick(r, CANDIDATE_COLS, "email2");
    const phone = pick(r, CANDIDATE_COLS, "phone_cell")
      || pick(r, CANDIDATE_COLS, "phone_home")
      || pick(r, CANDIDATE_COLS, "phone_work");
    const ws = pick(r, CANDIDATE_COLS, "web_site");
    const linkedIn = /linkedin\.com/i.test(ws) ? ws : "";
    const city = pick(r, CANDIDATE_COLS, "city");
    const state = pick(r, CANDIDATE_COLS, "state");
    const location = [city, state].filter(Boolean).join(", ");
    candidateAoA.push([
      firstName, lastName, email, phone, linkedIn, location,
      "",
      pick(r, CANDIDATE_COLS, "current_employer"),
      pick(r, CANDIDATE_COLS, "source") || "OpenCATS import",
      pick(r, CANDIDATE_COLS, "key_skills").replace(/\s+/g, " ").trim(),
      pick(r, CANDIDATE_COLS, "notes").replace(/\s+/g, " ").trim(),
    ]);
  }

  // ── clients sheet ──
  const clientHeaders = [
    "name","industry","website","contactName","contactEmail","contactPhone","notes",
  ];
  const clientAoA: any[][] = [clientHeaders];
  for (const r of companyRows) {
    const name = pick(r, COMPANY_COLS, "name");
    if (!name) continue;
    clientAoA.push([
      name,
      pick(r, COMPANY_COLS, "key_technologies"),
      pick(r, COMPANY_COLS, "url"),
      "",
      "",
      pick(r, COMPANY_COLS, "phone1") || pick(r, COMPANY_COLS, "phone2"),
      pick(r, COMPANY_COLS, "notes").replace(/\s+/g, " ").trim(),
    ]);
  }

  // ── jobs sheet ──
  const jobHeaders = ["title","client","description","salary","location"];
  const jobAoA: any[][] = [jobHeaders];
  for (const r of jobOrderRows) {
    const title = pick(r, JOBORDER_COLS, "title");
    if (!title) continue;
    const companyId = pick(r, JOBORDER_COLS, "company_id");
    const clientName = companyIdToName.get(companyId) || "";
    const city = pick(r, JOBORDER_COLS, "city");
    const state = pick(r, JOBORDER_COLS, "state");
    const location = [city, state].filter(Boolean).join(", ");
    jobAoA.push([
      title,
      clientName,
      pick(r, JOBORDER_COLS, "description").replace(/\s+/g, " ").trim(),
      pick(r, JOBORDER_COLS, "salary"),
      location,
    ]);
  }

  // ── workbook ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(candidateAoA), "Candidates");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clientAoA), "Clients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jobAoA), "Jobs");

  XLSX.writeFile(wb, outputPath);
  console.log(`Wrote ${candidateAoA.length - 1} candidates, ${clientAoA.length - 1} clients, ${jobAoA.length - 1} jobs to ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
