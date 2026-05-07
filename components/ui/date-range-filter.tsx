"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, X } from "lucide-react";

export type DateRange = { from: string | null; to: string | null };

const PRESETS: { label: string; days: number | null }[] = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatRange(range: DateRange): string {
  if (!range.from && !range.to) return "";
  if (range.from && !range.to) return `from ${range.from}`;
  if (!range.from && range.to) return `until ${range.to}`;
  if (range.from === range.to) return range.from!;
  return `${range.from} → ${range.to}`;
}

/** Returns true when the given ISO timestamp falls within `range`.
 *  An empty range matches everything. Bounds are inclusive. */
export function dateInRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
  /** Field label used in the trigger ("Created", "Posted", etc.) */
  label?: string;
}

export function DateRangeFilter({ value, onChange, label = "Date" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = !!(value.from || value.to);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function applyPreset(days: number | null) {
    if (days === null) {
      onChange({ from: null, to: null });
      return;
    }
    onChange({ from: daysAgoIso(days), to: todayIso() });
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange({ from: null, to: null });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 h-9 rounded-md border px-3 text-sm transition-colors ${
          active
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-input bg-background text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Calendar className="h-3.5 w-3.5" />
        <span>{active ? formatRange(value) : label}</span>
        {active && (
          <span
            role="button"
            aria-label="Clear date filter"
            onClick={clear}
            className="ml-1 -mr-1 rounded p-0.5 hover:bg-indigo-100"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-72 bg-white border rounded-md shadow-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="text-xs px-2 py-1.5 rounded border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-10">From</label>
              <input
                type="date"
                value={value.from || ""}
                onChange={(e) => onChange({ ...value, from: e.target.value || null })}
                className="flex-1 h-8 rounded-md border border-input px-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-10">To</label>
              <input
                type="date"
                value={value.to || ""}
                onChange={(e) => onChange({ ...value, to: e.target.value || null })}
                className="flex-1 h-8 rounded-md border border-input px-2 text-sm"
              />
            </div>
          </div>
          {active && (
            <button
              type="button"
              onClick={() => onChange({ from: null, to: null })}
              className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
