// CSV building helper used by /api/{candidates,jobs,clients,contacts}/export.
// Kept in one place so every export endpoint shares the same escaping
// rules (RFC 4180-ish: double-quote when the value contains a quote,
// comma, or newline; escape internal quotes by doubling them).

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

function escapeCell(v: unknown): string {
  if (v == null) return "";
  let s: string;
  if (v instanceof Date) {
    s = v.toISOString();
  } else if (Array.isArray(v)) {
    s = v.map((x) => (x == null ? "" : String(x))).join("; ");
  } else if (typeof v === "object") {
    s = JSON.stringify(v);
  } else {
    s = String(v);
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Standard NextResponse-shaped helper: passes the CSV body and a
// Content-Disposition that triggers a download with a sensible
// filename in the user's browser.
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
