// Shared parser used by both the server route (/api/import/bulk)
// and the client-side import wizard preview. Returns the spreadsheet
// as a list of sheets, each with its own header row + data rows, so
// the UI can offer a sheet picker for multi-sheet xlsx workbooks
// without having to round-trip the file twice.
//
// Format detection is by file extension primarily, with content
// sniffing as a fallback (some browsers omit / mis-set MIME for
// xlsx files).
//
// ZIP support: full ATS exports often arrive as a .zip with one CSV
// per entity (Bullhorn, Greenhouse, OpenCATS dumps). We unzip
// in-browser via JSZip and treat every readable file inside as a
// sheet so the wizard's multi-sheet picker can drive the whole import
// in a single shot. A SQL dump that smells like OpenCATS gets routed
// through parse-opencats-dump and produces the same three sheets the
// migration script does.

import * as XLSX from "xlsx";
import JSZip from "jszip";
import { isOpenCatsDump, parseOpenCatsDump } from "./parse-opencats-dump";

export type ParsedSheet = {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type ParsedSpreadsheet = {
  format: "csv" | "tsv" | "xlsx" | "json" | "jsonl" | "zip" | "sql";
  sheets: ParsedSheet[];
};

// SheetJS reads all of these natively, so we accept anything it can
// open. Covers Excel (xlsx/xls/xlsm/xlsb), OpenDocument (ods/fods —
// LibreOffice + Google Sheets export), Apple Numbers, plus a long
// tail of legacy formats some old ATSs still export (dBase, SYLK,
// Lotus, Quattro Pro). The user gets one drop-zone for everything
// rather than having to "Save As CSV" first.
const XLSX_EXTS = [
  ".xlsx", ".xlsm", ".xlsb", ".xls",
  ".ods", ".fods",
  ".numbers",
  ".dbf",
  ".dif", ".sylk", ".slk", ".prn",
  ".eth", ".rtf",
  ".wk1", ".wk3", ".wk4", ".123",
];
const JSONL_EXTS = [".jsonl", ".ndjson"];

function detectFormat(filename: string, headerBytes?: Uint8Array): ParsedSpreadsheet["format"] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".sql")) return "sql";
  if (JSONL_EXTS.some((e) => lower.endsWith(e))) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".tsv")) return "tsv";
  if (lower.endsWith(".csv")) return "csv";
  if (XLSX_EXTS.some((e) => lower.endsWith(e))) return "xlsx";

  // Content sniffing for files dropped without an extension, or with
  // a generic MIME type:
  //   PK     → ZIP container (xlsx/ods/numbers are zips too, but we
  //            already covered them by extension above — bare PK is
  //            either an unlabelled xlsx or a multi-file bundle, and
  //            parseZip handles both)
  //   D0 CF  → CFB compound file (xls)
  //   <?     → XML (SpreadsheetML, FODS, FODT all start this way —
  //            xlsx library auto-detects)
  if (headerBytes && headerBytes.length >= 2) {
    if (headerBytes[0] === 0x50 && headerBytes[1] === 0x4b) return "zip";
    if (headerBytes[0] === 0xd0 && headerBytes[1] === 0xcf) return "xlsx";
    if (headerBytes[0] === 0x3c && headerBytes[1] === 0x3f) return "xlsx";
  }
  return "csv";
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

function parseDelimited(text: string, format: "csv" | "tsv", name = "Sheet1"): ParsedSheet {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    return { name, headers: [], rows: [] };
  }
  const first = lines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const delim = format === "tsv" || tabCount > commaCount ? "\t" : ",";

  const headers = parseLine(lines[0], delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delim);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = (values[idx] || "").trim();
    });
    rows.push(record);
  }
  return { name, headers, rows };
}

function parseXlsx(bytes: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });
    if (rows.length === 0) return { name, headers: [], rows: [] };
    const headers = rows[0].map((h) => String(h ?? "").trim()).filter((h) => h.length > 0);
    const dataRows = rows.slice(1).map((r) => {
      const rec: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const v = r[idx];
        rec[h] = v == null ? "" : String(v).trim();
      });
      return rec;
    });
    return { name, headers, rows: dataRows };
  });
}

function parseJson(text: string, name = "JSON"): ParsedSheet {
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return objectsToSheet(arr, name);
}

// JSON Lines / NDJSON: one JSON object per line. The de-facto format
// for bulk exports from Greenhouse / Lever / a lot of analytics
// pipelines. Tolerant of blank lines + trailing whitespace.
function parseJsonLines(text: string, name = "JSONL"): ParsedSheet {
  const objects: any[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      objects.push(JSON.parse(trimmed));
    } catch {
      // ignore lines that aren't valid JSON — keeps a stray header
      // comment or partial last line from blowing up the whole import
    }
  }
  return objectsToSheet(objects, name);
}

function objectsToSheet(arr: any[], name: string): ParsedSheet {
  const headers = Array.from(
    new Set(arr.flatMap((r: any) => (typeof r === "object" && r ? Object.keys(r) : [])))
  );
  const rows = arr.map((r: any) => {
    const rec: Record<string, string> = {};
    headers.forEach((h) => {
      const v = r?.[h];
      rec[h] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    });
    return rec;
  });
  return { name, headers, rows };
}

function baseName(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const tail = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = tail.lastIndexOf(".");
  return dot > 0 ? tail.slice(0, dot) : tail;
}

async function parseZip(bytes: ArrayBuffer): Promise<ParsedSheet[]> {
  const zip = await JSZip.loadAsync(bytes);
  // Walk every file in the archive; pick out the ones we know how to
  // read. We keep stable insertion order (zip entries) so a workbook
  // with both clients.csv and candidates.csv shows up in the same
  // order the user packaged them.
  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir) entries.push({ path, entry });
  });

  const sheets: ParsedSheet[] = [];
  for (const { path, entry } of entries) {
    const lower = path.toLowerCase();
    // Skip macOS noise and hidden files.
    if (lower.includes("__macosx/") || lower.startsWith(".") || lower.includes("/.")) continue;

    if (lower.endsWith(".sql")) {
      const text = await entry.async("string");
      if (isOpenCatsDump(text)) {
        sheets.push(...parseOpenCatsDump(text));
      }
      continue;
    }
    if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
      const text = await entry.async("string");
      const fmt = lower.endsWith(".tsv") ? "tsv" : "csv";
      const sheet = parseDelimited(text, fmt, baseName(path));
      if (sheet.headers.length > 0) sheets.push(sheet);
      continue;
    }
    if (XLSX_EXTS.some((e) => lower.endsWith(e))) {
      const buf = await entry.async("arraybuffer");
      sheets.push(...parseXlsx(buf));
      continue;
    }
    if (lower.endsWith(".json")) {
      const text = await entry.async("string");
      try {
        sheets.push(parseJson(text, baseName(path)));
      } catch {
        // ignore malformed json inside an archive — other entries may
        // still be importable.
      }
      continue;
    }
    if (JSONL_EXTS.some((e) => lower.endsWith(e))) {
      const text = await entry.async("string");
      const sheet = parseJsonLines(text, baseName(path));
      if (sheet.headers.length > 0) sheets.push(sheet);
      continue;
    }
  }

  if (sheets.length === 0) {
    throw new Error(
      "Couldn't find any importable files inside this ZIP. Expected CSV, TSV, Excel, JSON, JSONL, or an OpenCATS SQL dump."
    );
  }
  return sheets;
}

// Server entry: accepts a File (or Blob) and parses based on filename
// + content sniff. Returns every sheet so the UI can render a picker.
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const arrayBuffer = await file.arrayBuffer();
  const head = new Uint8Array(arrayBuffer.slice(0, 8));
  const format = detectFormat(file.name, head);

  if (format === "zip") {
    return { format, sheets: await parseZip(arrayBuffer) };
  }
  if (format === "sql") {
    const text = new TextDecoder().decode(arrayBuffer);
    if (!isOpenCatsDump(text)) {
      throw new Error("Only OpenCATS SQL dumps are supported here. Other dumps need to be converted to CSV first.");
    }
    return { format, sheets: parseOpenCatsDump(text) };
  }
  if (format === "xlsx") {
    return { format, sheets: parseXlsx(arrayBuffer) };
  }
  if (format === "json") {
    const text = new TextDecoder().decode(arrayBuffer);
    return { format, sheets: [parseJson(text)] };
  }
  if (format === "jsonl") {
    const text = new TextDecoder().decode(arrayBuffer);
    return { format, sheets: [parseJsonLines(text)] };
  }
  const text = new TextDecoder().decode(arrayBuffer);
  return { format, sheets: [parseDelimited(text, format)] };
}
