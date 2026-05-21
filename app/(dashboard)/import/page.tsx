"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  Users,
  Building,
  Briefcase,
  CheckCircle,
  AlertCircle,
  Download,
  ArrowLeft,
} from "lucide-react";
import { IMPORT_FIELDS, autoDetectMapping, type ImportType } from "@/lib/import-fields";
import { parseSpreadsheetFile, type ParsedSheet } from "@/lib/parse-spreadsheet";

const SUPPORTED_FORMATS = [
  { name: "CSV", ext: ".csv" },
  { name: "TSV", ext: ".tsv" },
  { name: "Excel", ext: ".xlsx / .xls" },
  { name: "JSON", ext: ".json" },
];

// Cap matches what the server-side parser comfortably handles on
// Vercel's serverless body limit. Generous enough for "I just exported
// every candidate from another ATS" without inviting 500MB uploads.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Preview = {
  sheets: ParsedSheet[];
  activeSheet: string;
};

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>("candidates");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Three logical stages, driven by what we have so far:
  //   1. no file        → file picker
  //   2. file + preview → mapping UI
  //   3. result         → success / errors panel
  const stage: "pick" | "map" | "done" = result ? "done" : preview ? "map" : "pick";

  function resetAll() {
    setFile(null);
    setPreview(null);
    setParseError("");
    setMapping({});
    setResult(null);
  }

  async function handleFileChosen(f: File | null) {
    setResult(null);
    setParseError("");
    setPreview(null);
    setMapping({});
    setFile(f);
    if (!f) return;

    if (f.size > MAX_FILE_BYTES) {
      setParseError(`File exceeds the ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB limit.`);
      setFile(null);
      return;
    }

    // JSON: no headers to map, run the legacy path on import.
    if (f.name.toLowerCase().endsWith(".json")) return;

    setParsing(true);
    try {
      const parsed = await parseSpreadsheetFile(f);
      const usable = parsed.sheets.filter((s) => s.headers.length > 0);
      if (usable.length === 0) {
        setParseError("Could not detect any columns in this file.");
        setFile(null);
        setParsing(false);
        return;
      }
      const activeSheet = usable[0].name;
      setPreview({ sheets: usable, activeSheet });
      setMapping(autoDetectMapping(importType, usable[0].headers));
    } catch (e: any) {
      setParseError(e.message || "Could not parse file");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  // Sheet picker handler — when the user flips between tabs in a
  // multi-sheet xlsx, re-seed the column mapping from the new
  // sheet's headers.
  function onSheetChange(name: string) {
    if (!preview) return;
    const sheet = preview.sheets.find((s) => s.name === name) || preview.sheets[0];
    setPreview({ ...preview, activeSheet: sheet.name });
    setMapping(autoDetectMapping(importType, sheet.headers));
  }

  function onTypeChange(next: ImportType) {
    setImportType(next);
    setResult(null);
    // Re-run auto-detect with the new field set so the user doesn't
    // have to re-pick the file.
    if (preview) {
      const sheet =
        preview.sheets.find((s) => s.name === preview.activeSheet) || preview.sheets[0];
      setMapping(autoDetectMapping(next, sheet.headers));
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      // Send records as JSON when we already parsed the file in the
      // browser (which is always true for CSV/TSV/XLSX). Avoids the
      // ~4.5MB Vercel multipart cap and keeps the request body
      // proportional to actual content, not raw file weight.
      let res: Response;
      if (preview && activeSheet) {
        res = await fetch("/api/import/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: importType,
            mapping,
            records: activeSheet.rows,
          }),
        });
      } else {
        // JSON files: no wizard, no client parse. Multipart it.
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", importType);
        res = await fetch("/api/import/bulk", { method: "POST", body: fd });
      }
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Import failed. Please check your file format." });
    }
    setImporting(false);
  }

  const fields = IMPORT_FIELDS[importType];
  const requiredUnmapped = fields.some((f) => f.required && !mapping[f.key]);
  // The current sheet view — derived so the rest of the JSX doesn't
  // have to repeat the .find lookup.
  const activeSheet = preview
    ? preview.sheets.find((s) => s.name === preview.activeSheet) || preview.sheets[0]
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Data</h1>
        <p className="text-gray-500">
          Import candidates, clients, and jobs from a spreadsheet or export
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            Bulk Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Export your data from your current ATS as a spreadsheet, then upload it here.
          </p>

          {/* Supported formats — XLSX/XLS removed pending a real parser
              (the previous "support" read binary as text and silently
              produced garbage). Use Save As → CSV from Excel for now. */}
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_FORMATS.map((fmt) => (
              <Badge key={fmt.name} variant="secondary" className="text-xs py-1 px-2.5">
                {fmt.name}
                <span className="ml-1 text-gray-400">({fmt.ext})</span>
              </Badge>
            ))}
          </div>

          {/* Import type selector — disabled while a previous result is
              showing so a user-triggered switch doesn't quietly nuke
              the success panel. */}
          <div className="flex gap-2">
            {[
              { value: "candidates" as const, label: "Candidates", icon: Users },
              { value: "clients" as const, label: "Clients", icon: Building },
              { value: "jobs" as const, label: "Jobs", icon: Briefcase },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => onTypeChange(value)}
                disabled={stage === "done"}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  importType === value
                    ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                } ${stage === "done" ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Stage 1 — file picker (also shows for JSON files since
              there's nothing to map there). */}
          {stage === "pick" && (
            <>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition">
                <Upload className="h-8 w-8 text-gray-300 mb-2" />
                <span className="text-sm font-medium text-gray-700">
                  {file ? file.name : "Click to upload a CSV, TSV, Excel or JSON file"}
                </span>
                <span className="text-xs text-gray-400 mt-1">
                  CSV, TSV, XLSX, XLS, JSON (max 25MB)
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.tsv,.json,.txt,.xlsx,.xls,.xlsm,.xlsb"
                  onChange={(e) => handleFileChosen(e.target.files?.[0] || null)}
                />
              </label>

              {parsing && (
                <p className="text-xs text-gray-400">Parsing file…</p>
              )}
              {parseError && (
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* JSON files: nothing to map, jump straight to import. */}
              {file && file.name.toLowerCase().endsWith(".json") && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700">{file.name}</span>
                    <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? "Importing..." : `Import ${importType}`}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Stage 2 — header mapping + preview. */}
          {stage === "map" && preview && activeSheet && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-700">{file?.name}</span>
                  <span className="text-gray-400">
                    · {activeSheet.rows.length} row{activeSheet.rows.length === 1 ? "" : "s"} · {activeSheet.headers.length} columns
                  </span>
                </div>
                <button
                  onClick={resetAll}
                  className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Choose a different file
                </button>
              </div>

              {/* Sheet picker — only shows up for multi-sheet xlsx
                  workbooks. Common case (CSV/TSV/single-sheet xlsx)
                  is hidden so the wizard stays minimal. */}
              {preview.sheets.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                    Sheet
                  </span>
                  {preview.sheets.map((s) => {
                    const isActive = s.name === preview.activeSheet;
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => onSheetChange(s.name)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                          isActive
                            ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                            : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                        }`}
                        title={`${s.rows.length} row${s.rows.length === 1 ? "" : "s"} · ${s.headers.length} columns`}
                      >
                        {s.name}
                        <span className={`ml-1 text-[10px] ${isActive ? "text-indigo-500" : "text-gray-400"}`}>
                          {s.rows.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Mapping table. Each ATS field on the left, a dropdown
                  on the right offering every detected header (plus
                  "skip"). Required rows get a red asterisk so the user
                  can't miss what they need to wire up. */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                    Map your columns to ATS fields
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    We auto-matched what we could. Adjust anything that looks off.
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {fields.map((field) => (
                    <div key={field.key} className="flex items-center gap-4 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </p>
                        {field.hint && (
                          <p className="text-[11px] text-gray-400">{field.hint}</p>
                        )}
                      </div>
                      <select
                        value={mapping[field.key] || ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            [field.key]: e.target.value || null,
                          }))
                        }
                        className={`text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[200px] ${
                          field.required && !mapping[field.key]
                            ? "border-red-300"
                            : "border-gray-200"
                        }`}
                      >
                        <option value="">— Skip this field —</option>
                        {activeSheet.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* First-5 preview using the active mapping. Lets the
                  user sanity-check that "phone" really maps to a phone
                  column and not, say, the LinkedIn one. */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                    Preview · first {Math.min(activeSheet.rows.length, 5)} of {activeSheet.rows.length}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50/60">
                        {fields.map((f) => (
                          <th key={f.key} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {fields.map((f) => {
                            const header = mapping[f.key];
                            const val = header ? row[header] : "";
                            return (
                              <td key={f.key} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[200px] truncate" title={val || ""}>
                                {val || <span className="text-gray-300">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {requiredUnmapped && (
                <div className="bg-amber-50 text-amber-700 text-sm p-3 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Map every required field (marked with *) before importing.</span>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleImport} disabled={importing || requiredUnmapped}>
                  {importing ? "Importing..." : `Import ${activeSheet.rows.length} ${importType}`}
                </Button>
              </div>
            </div>
          )}

          {/* Stage 3 — result panel. */}
          {stage === "done" && result && (
            <div className="space-y-3">
              <div className={`rounded-lg p-4 ${result.error ? "bg-red-50" : "bg-green-50"}`}>
                {result.error ? (
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{result.error}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-medium">
                        Import complete! {result.imported} of {result.total} records imported.
                      </span>
                    </div>
                    {result.skipped > 0 && (
                      <p className="text-xs text-green-600 ml-7">
                        {result.skipped} records skipped (duplicates or missing required fields)
                      </p>
                    )}
                    {result.errors?.length > 0 && (
                      <div className="ml-7">
                        <p className="text-xs text-amber-600">Some errors occurred:</p>
                        {result.errors.map((err: string, i: number) => (
                          <p key={i} className="text-xs text-amber-500">{err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={resetAll}>
                Import more
              </Button>
            </div>
          )}

          {/* Template downloads — always visible so the user can grab
              one before they start. */}
          <div className="border-t pt-4">
            <p className="text-xs text-gray-400 mb-2">Need a template?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => downloadTemplate("candidates")}
              >
                <Download className="h-3.5 w-3.5" />
                Candidates CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => downloadTemplate("clients")}
              >
                <Download className="h-3.5 w-3.5" />
                Clients CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => downloadTemplate("jobs")}
              >
                <Download className="h-3.5 w-3.5" />
                Jobs CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function downloadTemplate(type: string) {
  let content = "";
  if (type === "candidates") {
    content = "firstName,lastName,email,phone,linkedIn,location,title,company,skills,source,summary\nJohn,Smith,john@example.com,555-0100,https://linkedin.com/in/johnsmith,\"New York, NY\",Software Engineer,Acme Inc,\"JavaScript,React,Node.js\",LinkedIn,Experienced developer";
  } else if (type === "clients") {
    content = "name,industry,website,contactName,contactEmail,contactPhone,notes\nAcme Corp,Technology,https://acme.com,Jane Smith,jane@acme.com,555-0200,Key account";
  } else {
    content = "title,description,client,salary,location\nSenior Engineer,Full-stack role,Acme Corp,\"$150,000 - $180,000\",\"San Francisco, CA\"";
  }
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
