/* eslint-disable no-console */
// One-off: pull the `candidate` rows from an OpenCATS MariaDB dump
// and emit a CSV that the existing import wizard can consume.
// Used to demo the agency-side import flow with realistic data
// without building a full SQL-importer feature.
//
// Run (from the repo root):
//   npx tsx scripts/opencats-dump-to-csv.ts <path-to-backup.sql> <output.csv> [limit]
//
// The wizard will auto-map most columns by alias. Anything it can't
// figure out, the user can resolve via the mapping UI.

import * as fs from "fs";
import * as path from "path";

const COLUMNS = [
  "candidate_id", "site_id", "last_name", "first_name", "middle_name",
  "phone_home", "phone_cell", "phone_work", "address", "city", "state",
  "zip", "source", "date_available", "can_relocate", "notes",
  "key_skills", "current_employer", "entered_by", "owner",
  "date_created", "date_modified", "email1", "email2", "web_site",
  "import_id", "is_hot", "eeo_ethnic_type_id", "eeo_veteran_type_id",
  "eeo_disability_status", "eeo_gender", "desired_pay", "current_pay",
  "is_active", "is_admin_hidden", "best_time_to_call",
];

// MySQL INSERT VALUES parser. Each row is wrapped in parens; values
// are NULL, quoted strings (single-quote with backslash escapes), or
// numbers. Multi-row INSERTs are pretty-printed in OpenCATS dumps so
// each tuple is on its own line.
function parseRow(rowText: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = rowText.length;
  while (i < n) {
    // Skip leading whitespace
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
          // Double-single-quote escape inside MySQL strings.
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
      // NULL or unquoted number
      let v = "";
      while (i < n && rowText[i] !== "," && rowText[i] !== ")") {
        v += rowText[i];
        i++;
      }
      v = v.trim();
      out.push(v === "NULL" ? "" : v);
    }
    // Skip past the comma
    while (i < n && /\s/.test(rowText[i])) i++;
    if (rowText[i] === ",") i++;
  }
  return out;
}

function escapeCsv(v: string): string {
  if (v == null) return "";
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const limit = process.argv[4] ? parseInt(process.argv[4], 10) : Infinity;

  if (!inputPath || !outputPath) {
    console.error("Usage: npx tsx scripts/opencats-dump-to-csv.ts <backup.sql> <output.csv> [limit]");
    process.exit(1);
  }
  if (!fs.existsSync(inputPath)) {
    console.error("Input not found:", inputPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(inputPath, "utf8");

  // Find the INSERT block for `candidate`.
  const startMarker = "INSERT INTO `candidate` VALUES";
  const startIdx = sql.indexOf(startMarker);
  if (startIdx < 0) {
    console.error("No INSERT INTO `candidate` found.");
    process.exit(1);
  }
  // The block ends at the first semicolon followed by newline.
  const blockEnd = sql.indexOf(";\n", startIdx);
  const block = sql.slice(startIdx + startMarker.length, blockEnd);

  // Pretty-printed dumps put each row on its own line. Split tuples
  // greedily by scanning for top-level "(...)," boundaries — strings
  // can contain parens so we need a stateful split.
  const rows: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (inString) {
      current += c;
      if (c === "\\") {
        if (i + 1 < block.length) {
          current += block[i + 1];
          i++;
        }
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
        if (rows.length >= limit) break;
        current = "";
      } else {
        current += c;
      }
      continue;
    }
    if (depth > 0) current += c;
  }

  // Map to ATS-friendly headers — alias-aware so the wizard's
  // auto-detect picks them up without manual mapping.
  const header = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "linkedIn",
    "location",
    "currentTitle",
    "currentCompany",
    "source",
    "skills",
    "summary",
  ];

  const lines: string[] = [header.join(",")];

  for (const r of rows) {
    const cells = parseRow(r);
    if (cells.length < COLUMNS.length) continue;

    const get = (col: string) => cells[COLUMNS.indexOf(col)] || "";

    const firstName = get("first_name");
    const lastName = get("last_name");
    if (!firstName && !lastName) continue;

    const email = get("email1") || get("email2");
    // Phone preference: cell > home > work.
    const phone = get("phone_cell") || get("phone_home") || get("phone_work");
    const linkedIn = (get("web_site") || "").match(/linkedin\.com/i)
      ? get("web_site")
      : "";
    const city = get("city");
    const state = get("state");
    const location = [city, state].filter(Boolean).join(", ");
    // OpenCATS doesn't store a separate "current title", but it does
    // store current_employer. Title can be empty.
    const currentCompany = get("current_employer");
    const source = get("source") || "OpenCATS import";
    const skills = get("key_skills").replace(/\s+/g, " ").trim();
    const summary = get("notes").replace(/\s+/g, " ").trim();

    lines.push(
      [
        firstName,
        lastName,
        email,
        phone,
        linkedIn,
        location,
        "", // currentTitle — not in OpenCATS candidate table
        currentCompany,
        source,
        skills,
        summary,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  fs.writeFileSync(outputPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${lines.length - 1} candidates to ${outputPath}`);
  console.log(`Sample first row:\n${lines[1] || "(none)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
