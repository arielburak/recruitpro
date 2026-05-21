// Shared parser used by both the server route (/api/import/bulk)
// and the client-side import wizard preview. Returns the spreadsheet
// as a list of sheets, each with its own header row + data rows, so
// the UI can offer a sheet picker for multi-sheet xlsx workbooks
// without having to round-trip the file twice.
//
// Format detection is by file extension primarily, with content
// sniffing as a fallback (some browsers omit / mis-set MIME for
// xlsx files).

import * as XLSX from "xlsx";

export type ParsedSheet = {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type ParsedSpreadsheet = {
  format: "csv" | "tsv" | "xlsx" | "json";
  sheets: ParsedSheet[];
};

const XLSX_EXTS = [".xlsx", ".xls", ".xlsm", ".xlsb"];

function detectFormat(filename: string, headerBytes?: Uint8Array): ParsedSpreadsheet["format"] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".tsv")) return "tsv";
  if (lower.endsWith(".csv")) return "csv";
  if (XLSX_EXTS.some((e) => lower.endsWith(e))) return "xlsx";

  // Content sniffing: xlsx is a ZIP (starts with PK), .xls is a CFB
  // (starts with D0 CF). Falls back to CSV otherwise.
  if (headerBytes && headerBytes.length >= 2) {
    if (headerBytes[0] === 0x50 && headerBytes[1] === 0x4b) return "xlsx";
    if (headerBytes[0] === 0xd0 && headerBytes[1] === 0xcf) return "xlsx";
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

function parseDelimited(text: string, format: "csv" | "tsv"): ParsedSheet {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    return { name: "Sheet1", headers: [], rows: [] };
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
  return { name: "Sheet1", headers, rows };
}

function parseXlsx(bytes: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // header: 1 → returns array-of-arrays. We promote row 0 to keys.
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

// Server entry: accepts a File (or Blob) and parses based on filename
// + content sniff. Returns every sheet so the UI can render a picker.
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const arrayBuffer = await file.arrayBuffer();
  const head = new Uint8Array(arrayBuffer.slice(0, 8));
  const format = detectFormat(file.name, head);

  if (format === "xlsx") {
    return { format, sheets: parseXlsx(arrayBuffer) };
  }
  if (format === "json") {
    const text = new TextDecoder().decode(arrayBuffer);
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    // Stringify-ify each row's values so the downstream record shape
    // matches the delimited path.
    const headers = Array.from(
      new Set(arr.flatMap((r: any) => (typeof r === "object" && r ? Object.keys(r) : [])))
    );
    const rows = arr.map((r: any) => {
      const rec: Record<string, string> = {};
      headers.forEach((h) => {
        const v = r?.[h];
        rec[h] = v == null ? "" : String(v);
      });
      return rec;
    });
    return { format, sheets: [{ name: "JSON", headers, rows }] };
  }
  const text = new TextDecoder().decode(arrayBuffer);
  return { format, sheets: [parseDelimited(text, format)] };
}
