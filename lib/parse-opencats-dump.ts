// Browser-safe OpenCATS MariaDB dump parser. The user can drop the
// `.sql` file (or the `.zip` containing it) straight into the import
// wizard and we'll produce three sheets — Candidates, Clients, Jobs —
// that flow through the existing per-org dedup pipeline.
//
// Logic mirrors scripts/opencats-dump-to-xlsx.ts but returns
// ParsedSheet rows instead of writing an xlsx file, so the wizard's
// multi-sheet picker can drive it.

import type { ParsedSheet } from "./parse-spreadsheet";

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
  // OpenCATS dumps come in two flavours: one big `INSERT INTO ... VALUES (..),(..);`
  // and multi-statement per-row inserts. Collect all of them.
  const marker = `INSERT INTO \`${table}\` VALUES`;
  const out: string[][] = [];
  let cursor = 0;
  while (true) {
    const idx = sql.indexOf(marker, cursor);
    if (idx < 0) break;
    const end = sql.indexOf(";\n", idx);
    if (end < 0) break;
    const block = sql.slice(idx + marker.length, end);
    for (const tuple of splitTuples(block)) out.push(parseRow(tuple));
    cursor = end + 2;
  }
  return out;
}

// Pull the column order out of `CREATE TABLE \`name\` (...)`. OpenCATS
// dumps from different versions reorder columns (e.g. `billing_contact`
// moves around), so a hardcoded list will silently map the wrong
// column to the wrong field. Reading it from the schema makes this
// resilient to whichever release the user happens to export from.
function extractTableColumns(sql: string, table: string): string[] {
  const start = sql.indexOf(`CREATE TABLE \`${table}\``);
  if (start < 0) return [];
  const openParen = sql.indexOf("(", start);
  if (openParen < 0) return [];
  // Find the matching close paren — walk with depth tracking because
  // VARCHAR(64) etc. introduce nested parens.
  let depth = 0;
  let end = -1;
  for (let i = openParen; i < sql.length; i++) {
    const c = sql[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];
  const body = sql.slice(openParen + 1, end);
  const cols: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    // Skip indexes, keys, constraints — only column-definition lines
    // start with a backticked identifier.
    if (!trimmed.startsWith("`")) continue;
    const close = trimmed.indexOf("`", 1);
    if (close > 1) cols.push(trimmed.slice(1, close));
  }
  return cols;
}

function pick(row: string[], cols: string[], col: string): string {
  const i = cols.indexOf(col);
  return i >= 0 ? row[i] || "" : "";
}

// Quick sniff so we only run the parser on dumps that actually look
// like OpenCATS. Other MySQL/MariaDB dumps would explode here.
export function isOpenCatsDump(sql: string): boolean {
  return (
    sql.includes("INSERT INTO `candidate`") ||
    sql.includes("CREATE TABLE `candidate`") ||
    sql.includes("INSERT INTO `joborder`")
  );
}

// Maps OpenCATS status IDs to RecruitPro's canonical PipelineStage
// names (lib/constants.ts → DEFAULT_STAGES). Anything we can't map
// confidently falls into "Sourced" so the relationship still gets
// created — the user can re-stage manually from there.
const OPENCATS_STATUS_TO_STAGE: Record<string, string> = {
  "0":   "Sourced",          // No Status
  "100": "Sourced",          // No Contact
  "200": "Internal Review",
  "300": "Internal Review",  // Ready to send
  "350": "Internal Review",  // Internal Review (mercel)
  "375": "Submitted",        // Approved
  "400": "Submitted",
  "500": "Interviewing",
  "550": "Internal Review",  // On Hold — closest neutral
  "575": "Sourced",          // Backlog
  "600": "Offered",
  "650": "Rejected",         // Not in Consideration
  "700": "Rejected",         // Client Declined
  "800": "Placed",
  "850": "Placed",           // Joined
};

export function parseOpenCatsDump(sql: string): ParsedSheet[] {
  // Schema columns first — OpenCATS releases reorder them, so we
  // must read them from the dump's CREATE TABLE statements rather
  // than hardcoding.
  const CANDIDATE_COLS = extractTableColumns(sql, "candidate");
  const COMPANY_COLS = extractTableColumns(sql, "company");
  const JOBORDER_COLS = extractTableColumns(sql, "joborder");
  const PIPELINE_COLS = extractTableColumns(sql, "candidate_joborder");

  const candidateRows = extractTable(sql, "candidate");
  const companyRows = extractTable(sql, "company");
  const jobOrderRows = extractTable(sql, "joborder");
  const pipelineRows = extractTable(sql, "candidate_joborder");

  const companyIdToName = new Map<string, string>();
  for (const r of companyRows) {
    const id = pick(r, COMPANY_COLS, "company_id");
    const name = pick(r, COMPANY_COLS, "name");
    if (id && name) companyIdToName.set(id, name);
  }

  // `externalId` carries the OpenCATS primary key through the import
  // so we can later re-wire candidate↔job relationships back to the
  // right rows.
  const candidateHeaders = [
    "externalId","firstName","lastName","email","phone","linkedIn","location",
    "currentTitle","currentCompany","source","skills","summary",
  ];
  const candidateData: Record<string, string>[] = [];
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
    candidateData.push({
      externalId: pick(r, CANDIDATE_COLS, "candidate_id"),
      firstName,
      lastName,
      email,
      phone,
      linkedIn,
      location,
      currentTitle: "",
      currentCompany: pick(r, CANDIDATE_COLS, "current_employer"),
      source: pick(r, CANDIDATE_COLS, "source") || "OpenCATS import",
      skills: pick(r, CANDIDATE_COLS, "key_skills").replace(/\s+/g, " ").trim(),
      summary: pick(r, CANDIDATE_COLS, "notes").replace(/\s+/g, " ").trim(),
    });
  }

  const clientHeaders = [
    "externalId","name","industry","website","contactName","contactEmail","contactPhone","notes",
  ];
  const clientData: Record<string, string>[] = [];
  for (const r of companyRows) {
    const name = pick(r, COMPANY_COLS, "name");
    if (!name) continue;
    // Skip the synthetic "-1" / blank placeholder rows OpenCATS uses
    // for the "Unspecified" company so we don't litter the workspace.
    if (name === "-1") continue;
    clientData.push({
      externalId: pick(r, COMPANY_COLS, "company_id"),
      name,
      industry: pick(r, COMPANY_COLS, "key_technologies"),
      website: pick(r, COMPANY_COLS, "url"),
      contactName: "",
      contactEmail: "",
      contactPhone: pick(r, COMPANY_COLS, "phone1") || pick(r, COMPANY_COLS, "phone2"),
      notes: pick(r, COMPANY_COLS, "notes").replace(/\s+/g, " ").trim(),
    });
  }

  const jobHeaders = ["externalId","title","client","description","salary","location"];
  const jobData: Record<string, string>[] = [];
  for (const r of jobOrderRows) {
    const title = pick(r, JOBORDER_COLS, "title");
    if (!title) continue;
    const companyId = pick(r, JOBORDER_COLS, "company_id");
    const clientName = companyIdToName.get(companyId) || "";
    const city = pick(r, JOBORDER_COLS, "city");
    const state = pick(r, JOBORDER_COLS, "state");
    const location = [city, state].filter(Boolean).join(", ");
    jobData.push({
      externalId: pick(r, JOBORDER_COLS, "joborder_id"),
      title,
      client: clientName,
      description: pick(r, JOBORDER_COLS, "description").replace(/\s+/g, " ").trim(),
      salary: pick(r, JOBORDER_COLS, "salary"),
      location,
    });
  }

  // Pipeline = candidate_joborder rows mapped to canonical stages so
  // the importer's "pipeline" handler can wire submissions back up by
  // externalId. We drop relationships pointing at candidates/jobs we
  // didn't keep (the synthetic OpenCATS placeholders); resolved
  // candidate/job externalIds are checked via the in-memory sheets.
  const candidateExternalIds = new Set(candidateData.map((c) => c.externalId).filter(Boolean));
  const jobExternalIds = new Set(jobData.map((j) => j.externalId).filter(Boolean));
  const pipelineHeaders = ["candidateExternalId","jobExternalId","stage","submittedAt"];
  const pipelineData: Record<string, string>[] = [];
  for (const r of pipelineRows) {
    const candId = pick(r, PIPELINE_COLS, "candidate_id");
    const jobId = pick(r, PIPELINE_COLS, "joborder_id");
    if (!candidateExternalIds.has(candId) || !jobExternalIds.has(jobId)) continue;
    const statusId = pick(r, PIPELINE_COLS, "status");
    const stage = OPENCATS_STATUS_TO_STAGE[statusId] || "Sourced";
    pipelineData.push({
      candidateExternalId: candId,
      jobExternalId: jobId,
      stage,
      submittedAt: pick(r, PIPELINE_COLS, "date_submitted") || pick(r, PIPELINE_COLS, "date_created"),
    });
  }

  const sheets: ParsedSheet[] = [];
  if (candidateData.length) sheets.push({ name: "Candidates", headers: candidateHeaders, rows: candidateData });
  if (clientData.length) sheets.push({ name: "Clients", headers: clientHeaders, rows: clientData });
  if (jobData.length) sheets.push({ name: "Jobs", headers: jobHeaders, rows: jobData });
  if (pipelineData.length) sheets.push({ name: "Pipeline", headers: pipelineHeaders, rows: pipelineData });
  return sheets;
}
