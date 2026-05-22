"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

// Single source of truth for the CSV export action across
// /candidates, /jobs, /clients, /contacts. Renders a button that
// posts to the matching /api/{type}/export endpoint and triggers a
// browser download.
//
// Two variants:
//   - 'outline' (default): used in page headers for "Export all".
//   - 'subtle': used inside the bulk-action bar for "Export selected".
//
// Pass an `ids` array when only the selected rows should be
// exported. An empty array means "everything the agency has".

type Props = {
  type: "candidates" | "jobs" | "clients" | "contacts";
  ids?: string[];
  variant?: "outline" | "subtle";
  label?: string;
  disabled?: boolean;
};

export function ExportCsvButton({
  type,
  ids = [],
  variant = "outline",
  label,
  disabled,
}: Props) {
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    if (exporting || disabled) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/${type}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {}
    setExporting(false);
  }

  if (variant === "subtle") {
    return (
      <button
        type="button"
        onClick={exportCsv}
        disabled={exporting || disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-md text-xs font-semibold disabled:opacity-60"
      >
        <Download className="h-3.5 w-3.5" />
        {exporting ? "Exporting…" : label || "Export CSV"}
      </button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={exportCsv}
      disabled={exporting || disabled}
      title={
        ids.length > 0
          ? `Download the selected ${type} as CSV`
          : `Download every ${type.slice(0, -1)} in your workspace as CSV`
      }
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      {exporting ? "Exporting…" : label || "Export"}
    </Button>
  );
}
