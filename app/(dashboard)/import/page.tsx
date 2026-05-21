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
import { IMPORT_FIELDS, autoDetectMapping, detectSheetType, type ImportType } from "@/lib/import-fields";
import { parseSpreadsheetFile, type ParsedSheet } from "@/lib/parse-spreadsheet";

// In multi-sheet mode, each sheet gets its own auto-detected entity
// type + its own mapping. The "Import all" path runs the imports in
// dependency order (clients → jobs → candidates) so Jobs.client can
// resolve against the Clients we just inserted.
type SheetPlan = {
  sheetName: string;
  type: ImportType;
  mapping: Record<string, string | null>;
};

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
  // Per-sheet plan: each sheet keeps its own auto-detected entity
  // type + mapping. In single-sheet mode this still works — there's
  // just one entry. The selected sheet's plan is what powers the
  // current mapping UI; editing the dropdowns updates that plan.
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Three logical stages, driven by what we have so far:
  //   1. no file        → file picker
  //   2. file + preview → mapping UI
  //   3. result         → success / errors panel
  const stage: "pick" | "map" | "done" = result ? "done" : preview ? "map" : "pick";

  // Current sheet's plan — derived so the rest of the page can read
  // mapping / type without juggling indexes.
  const activePlan = preview
    ? plans.find((p) => p.sheetName === preview.activeSheet) || null
    : null;
  const mapping = activePlan?.mapping || {};
  const isMultiSheet = (preview?.sheets.length || 0) > 1;

  function resetAll() {
    setFile(null);
    setPreview(null);
    setParseError("");
    setPlans([]);
    setResult(null);
  }

  async function handleFileChosen(f: File | null) {
    setResult(null);
    setParseError("");
    setPreview(null);
    setPlans([]);
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
      // Build a per-sheet plan up-front. detectSheetType picks the
      // most-likely entity per sheet by sheet name + header coverage,
      // so a workbook named Candidates/Clients/Jobs auto-types each
      // sheet without the user touching the type tab.
      const fileLevelType = isXlsxFile(f) ? null : importType;
      const initialPlans: SheetPlan[] = usable.map((s) => {
        const detected = fileLevelType
          ? { type: fileLevelType }
          : detectSheetType(s.name, s.headers);
        return {
          sheetName: s.name,
          type: detected.type,
          mapping: autoDetectMapping(detected.type, s.headers),
        };
      });
      setPlans(initialPlans);
      setPreview({ sheets: usable, activeSheet: usable[0].name });
      // Sync the type tab with the first sheet's plan.
      setImportType(initialPlans[0].type);
    } catch (e: any) {
      setParseError(e.message || "Could not parse file");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  function setMapping(next: Record<string, string | null>) {
    if (!activePlan) return;
    setPlans((current) =>
      current.map((p) =>
        p.sheetName === activePlan.sheetName ? { ...p, mapping: next } : p
      )
    );
  }

  function setPlanType(sheetName: string, type: ImportType) {
    const sheet = preview?.sheets.find((s) => s.name === sheetName);
    setPlans((current) =>
      current.map((p) =>
        p.sheetName === sheetName
          ? { ...p, type, mapping: sheet ? autoDetectMapping(type, sheet.headers) : p.mapping }
          : p
      )
    );
    if (preview?.activeSheet === sheetName) setImportType(type);
  }

  // Sheet picker handler — when the user flips between tabs in a
  // multi-sheet xlsx, sync the active tab + the type selector with
  // the per-sheet plan we built up-front.
  function onSheetChange(name: string) {
    if (!preview) return;
    const sheet = preview.sheets.find((s) => s.name === name) || preview.sheets[0];
    setPreview({ ...preview, activeSheet: sheet.name });
    const plan = plans.find((p) => p.sheetName === sheet.name);
    if (plan) setImportType(plan.type);
  }

  function onTypeChange(next: ImportType) {
    setImportType(next);
    setResult(null);
    // Re-run auto-detect with the new field set so the user doesn't
    // have to re-pick the file. Also persist the change into the
    // current sheet's plan.
    if (preview && activePlan) {
      setPlanType(activePlan.sheetName, next);
    }
  }

  async function postImport(type: ImportType, mappingPayload: Record<string, string | null>, records: any[]) {
    return fetch("/api/import/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, mapping: mappingPayload, records }),
    });
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      let res: Response;
      if (preview && activeSheet && activePlan) {
        res = await postImport(activePlan.type, activePlan.mapping, activeSheet.rows);
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

  // Sequential multi-entity import: clients first (so jobs can match
  // them by name), then jobs, then candidates. Anything else (each
  // sheet only has one plan in practice) follows in stable order.
  // No emails fire anywhere on this path — the bulk endpoint only
  // writes rows; we audited that explicitly for the dry-test case.
  async function handleImportAll() {
    if (!preview || plans.length === 0) return;
    setImporting(true);
    setResult(null);

    const ORDER: ImportType[] = ["clients", "jobs", "candidates"];
    const byType = (t: ImportType) =>
      plans.filter((p) => p.type === t).map((p) => ({
        plan: p,
        sheet: preview.sheets.find((s) => s.name === p.sheetName),
      })).filter((x) => x.sheet);
    const ordered = ORDER.flatMap(byType);

    const perSheet: { sheet: string; type: ImportType; imported: number; skipped: number; total: number; error?: string }[] = [];
    for (const { plan, sheet } of ordered) {
      if (!sheet) continue;
      try {
        const res = await postImport(plan.type, plan.mapping, sheet.rows);
        const data = await res.json();
        if (!res.ok) {
          perSheet.push({ sheet: sheet.name, type: plan.type, imported: 0, skipped: 0, total: sheet.rows.length, error: data.error });
        } else {
          perSheet.push({
            sheet: sheet.name,
            type: plan.type,
            imported: data.imported || 0,
            skipped: data.skipped || 0,
            total: data.total || sheet.rows.length,
          });
        }
      } catch (e: any) {
        perSheet.push({ sheet: sheet.name, type: plan.type, imported: 0, skipped: 0, total: sheet.rows.length, error: e.message || "Failed" });
      }
    }

    setResult({ multi: true, perSheet });
    setImporting(false);
  }

  const fields = IMPORT_FIELDS[importType];
  const requiredUnmapped = fields.some((f) => f.required && !mapping[f.key]);

  // Whether the "Import all sheets" path is available: needs 2+
  // sheets and every plan must have required fields wired up.
  const allReady =
    plans.length > 1 &&
    plans.every((p) =>
      IMPORT_FIELDS[p.type].filter((f) => f.required).every((f) => p.mapping[f.key])
    );
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

              {/* Multi-sheet detected: per-sheet plan summary +
                  one-click "Import all" CTA. Each row shows what we
                  detected (entity type) + whether the required
                  fields are mapped. Sheet name still doubles as the
                  active picker. */}
              {isMultiSheet && (
                <div className="bg-indigo-50/50 border border-indigo-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-indigo-900 font-medium">
                    Multi-sheet workbook detected — we'll import each tab as the entity it best matches.
                  </p>
                  <div className="space-y-1.5">
                    {plans.map((p) => {
                      const sheet = preview.sheets.find((s) => s.name === p.sheetName);
                      const isActive = p.sheetName === preview.activeSheet;
                      const missing = IMPORT_FIELDS[p.type].filter((f) => f.required && !p.mapping[f.key]);
                      const ready = missing.length === 0;
                      return (
                        <div
                          key={p.sheetName}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded ${
                            isActive ? "bg-white ring-1 ring-indigo-300" : "bg-white/60"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSheetChange(p.sheetName)}
                            className="text-sm font-medium text-gray-900 hover:text-indigo-700"
                          >
                            {p.sheetName}
                          </button>
                          <span className="text-[10px] text-gray-400">
                            {sheet?.rows.length || 0} rows
                          </span>
                          <select
                            value={p.type}
                            onChange={(e) => setPlanType(p.sheetName, e.target.value as ImportType)}
                            className="ml-auto text-xs border rounded px-1.5 py-0.5 bg-white"
                          >
                            <option value="candidates">Candidates</option>
                            <option value="clients">Clients</option>
                            <option value="jobs">Jobs</option>
                          </select>
                          {ready ? (
                            <span className="text-[10px] font-medium text-emerald-700 px-1.5 py-0.5 rounded bg-emerald-50">
                              Ready
                            </span>
                          ) : (
                            <span
                              className="text-[10px] font-medium text-amber-700 px-1.5 py-0.5 rounded bg-amber-50"
                              title={`Missing: ${missing.map((f) => f.label).join(", ")}`}
                            >
                              Map {missing.length} field{missing.length === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    onClick={handleImportAll}
                    disabled={importing || !allReady}
                    className="w-full"
                  >
                    {importing
                      ? "Importing all sheets…"
                      : allReady
                        ? `Import all ${plans.length} sheets`
                        : "Resolve the unmapped fields below first"}
                  </Button>
                </div>
              )}

              {/* Sheet picker — single-sheet xlsx and CSV/TSV use
                  the compact picker; multi-sheet workbooks use the
                  plan summary above (more informative). */}
              {preview.sheets.length > 1 && !isMultiSheet && (
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
                          setMapping({ ...mapping, [field.key]: e.target.value || null })
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
              {result.multi ? (
                <div className="rounded-lg p-4 bg-green-50 space-y-2">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-medium">All sheets processed</span>
                  </div>
                  <div className="ml-7 space-y-1 text-xs text-gray-700">
                    {result.perSheet.map((r: any) => (
                      <div key={r.sheet} className="flex items-center gap-2">
                        <span className="font-medium">{r.sheet}</span>
                        <span className="text-gray-400">({r.type})</span>
                        <span className="ml-auto">
                          {r.error ? (
                            <span className="text-red-600">{r.error}</span>
                          ) : (
                            <>
                              <span className="text-green-700">{r.imported} imported</span>
                              {r.skipped > 0 && (
                                <span className="text-gray-500"> · {r.skipped} skipped</span>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
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
              )}
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

function isXlsxFile(f: File): boolean {
  const lower = f.name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm") || lower.endsWith(".xlsb");
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
