"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Default source options surfaced when creating a candidate. The field
 * still accepts free text so recruiters aren't blocked by a canned list.
 */
export const DEFAULT_CANDIDATE_SOURCES = [
  "LinkedIn",
  "Referral",
  "Employee referral",
  "Indeed",
  "Glassdoor",
  "Company website",
  "Job board",
  "Cold outreach",
  "Networking event",
  "Conference",
  "Recruiter contact",
  "Database",
  "Other",
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  id?: string;
  name?: string;
  className?: string;
};

export function SourceInput({
  value,
  onChange,
  options = DEFAULT_CANDIDATE_SOURCES,
  placeholder = "LinkedIn, Referral, etc.",
  id,
  name,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const q = value.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;

  const showCustomHint =
    value.trim() && !options.some((o) => o.toLowerCase() === q);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
          aria-label="Toggle source suggestions"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </div>

      {open && (filtered.length > 0 || showCustomHint) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors",
                    value.toLowerCase() === opt.toLowerCase() &&
                      "bg-indigo-50 text-indigo-700"
                  )}
                >
                  {opt}
                </button>
              </li>
            ))}
            {showCustomHint && (
              <li className="border-t border-gray-100 mt-1 pt-1">
                <div className="px-3 py-1.5 text-xs text-gray-400">
                  Press Enter to use custom:{" "}
                  <span className="text-gray-600 font-medium">{value}</span>
                </div>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
