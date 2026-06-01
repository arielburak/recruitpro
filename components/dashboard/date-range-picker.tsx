"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";

// Date-range picker shared across dashboard widgets. Pre-baked
// presets cover the common timeframes; "Custom range" reveals
// inline From/To inputs. The widget passes the *resolved* range
// (`from`, `to`) up via onChange so consumers don't need to know
// about presets — they just refetch when the dates change.
//
// Why a shared component:
// - Same set of presets across Pipeline / Recruiter Performance /
//   future widgets keeps the dashboard mental model consistent.
// - Centralising preset math means edge cases (last-quarter wrap
//   into prev year, week-start on Mon, etc.) only get debugged once.

export type DatePresetKey =
  | "today"
  | "yesterday"
  | "7d"
  | "14d"
  | "30d"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "lastQuarter"
  | "ytd"
  | "lastYear"
  | "all"
  | "custom";

export const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "thisWeek", label: "This week" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisQuarter", label: "This quarter" },
  { key: "lastQuarter", label: "Last quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "lastYear", label: "Last year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function resolveDateRange(
  key: DatePresetKey,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);
  const eod = endOfDay(now);
  switch (key) {
    case "today":
      return { from: today, to: eod };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    case "7d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from, to: eod };
    }
    case "14d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 13);
      return { from, to: eod };
    }
    case "30d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from, to: eod };
    }
    case "thisWeek": {
      // Mon-first week. JS getDay() returns 0 for Sun; we shift so a
      // working-week boundary matches what a recruiter expects.
      const dow = today.getDay();
      const diff = (dow + 6) % 7;
      const from = new Date(today);
      from.setDate(from.getDate() - diff);
      return { from, to: eod };
    }
    case "thisMonth": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: eod };
    }
    case "lastMonth": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
      return { from, to };
    }
    case "thisQuarter": {
      const q = Math.floor(today.getMonth() / 3);
      const from = new Date(today.getFullYear(), q * 3, 1);
      return { from, to: eod };
    }
    case "lastQuarter": {
      const q = Math.floor(today.getMonth() / 3);
      const start =
        q === 0
          ? new Date(today.getFullYear() - 1, 9, 1)
          : new Date(today.getFullYear(), (q - 1) * 3, 1);
      const endMonth = start.getMonth() + 3;
      const end = endOfDay(new Date(start.getFullYear(), endMonth, 0));
      return { from: start, to: end };
    }
    case "ytd": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from, to: eod };
    }
    case "lastYear": {
      const from = new Date(today.getFullYear() - 1, 0, 1);
      const to = endOfDay(new Date(today.getFullYear() - 1, 11, 31));
      return { from, to };
    }
    case "all":
      return { from: new Date(0), to: eod };
    case "custom": {
      const from = customFrom
        ? startOfDay(new Date(customFrom))
        : new Date(today.getTime() - 29 * 86400000);
      const to = customTo ? endOfDay(new Date(customTo)) : eod;
      return { from, to };
    }
  }
}

export function fmtRangeShort(from: Date, to: Date): string {
  // Show year only when the range spans years — keeps the chip
  // short for the common in-year case.
  const sameYear = from.getFullYear() === to.getFullYear();
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  };
  return `${from.toLocaleDateString("en-US", opts)} – ${to.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export function DateRangePicker({
  preset,
  customFrom,
  customTo,
  onChange,
  align = "right",
}: {
  preset: DatePresetKey;
  customFrom?: string;
  customTo?: string;
  onChange: (next: { preset: DatePresetKey; customFrom?: string; customTo?: string }) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border rounded-md hover:bg-gray-50"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
        {DATE_PRESETS.find((p) => p.key === preset)?.label ?? "Pick range"}
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>
      {open && (
        <div
          className={`absolute ${align === "left" ? "left-0" : "right-0"} mt-1 z-30 w-56 bg-white border rounded-lg shadow-lg p-1`}
        >
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onChange({ preset: p.key, customFrom, customTo });
                if (p.key !== "custom") setOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 text-xs rounded ${
                preset === p.key
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="border-t mt-1 pt-2 px-2 pb-2 space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">From</p>
                <Input
                  type="date"
                  value={customFrom || ""}
                  onChange={(e) => onChange({ preset, customFrom: e.target.value, customTo })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">To</p>
                <Input
                  type="date"
                  value={customTo || ""}
                  onChange={(e) => onChange({ preset, customFrom, customTo: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <Button size="sm" className="w-full" onClick={() => setOpen(false)}>
                Apply
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
