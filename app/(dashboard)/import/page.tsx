"use client";

import { useState } from "react";
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
} from "lucide-react";

const SUPPORTED_FORMATS = [
  { name: "CSV", ext: ".csv" },
  { name: "Excel", ext: ".xlsx / .xls" },
  { name: "TSV", ext: ".tsv" },
  { name: "JSON", ext: ".json" },
];

export default function ImportPage() {
  const [importType, setImportType] = useState<"candidates" | "clients" | "jobs">("candidates");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", importType);

    try {
      const res = await fetch("/api/import/bulk", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Import failed. Please check your file format." });
    }
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Data</h1>
        <p className="text-gray-500">
          Import candidates, clients, and jobs from a spreadsheet or export
        </p>
      </div>

      {/* Bulk Import */}
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

          {/* Supported formats */}
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_FORMATS.map((fmt) => (
              <Badge key={fmt.name} variant="secondary" className="text-xs py-1 px-2.5">
                {fmt.name}
                <span className="ml-1 text-gray-400">({fmt.ext})</span>
              </Badge>
            ))}
          </div>

          {/* Import type selector */}
          <div className="flex gap-2">
            {[
              { value: "candidates" as const, label: "Candidates", icon: Users },
              { value: "clients" as const, label: "Clients", icon: Building },
              { value: "jobs" as const, label: "Jobs", icon: Briefcase },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => { setImportType(value); setResult(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  importType === value
                    ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Expected columns */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Expected CSV columns for {importType}:</p>
            <p className="text-xs text-gray-400">
              {importType === "candidates" && "firstName, lastName, email, phone, linkedIn, location, title, company, skills, source, summary"}
              {importType === "clients" && "name, industry, website, contactName, contactEmail, contactPhone, notes"}
              {importType === "jobs" && "title, description, client, salary, location"}
            </p>
          </div>

          {/* File upload */}
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition">
            <Upload className="h-8 w-8 text-gray-300 mb-2" />
            <span className="text-sm font-medium text-gray-700">
              {file ? file.name : "Click to upload a CSV, Excel, TSV or JSON file"}
            </span>
            <span className="text-xs text-gray-400 mt-1">
              CSV, XLSX, XLS, TSV, JSON (max 10MB)
            </span>
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls,.tsv,.json"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
              }}
            />
          </label>

          {file && (
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

          {/* Results */}
          {result && (
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

          {/* Download template */}
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
