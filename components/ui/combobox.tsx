"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Free-form combobox: an input that doubles as a picker. The user can
// pick from `options` to standardise the value (industry catalog,
// country list, …) OR just type their own — both produce the same
// onChange. Unlike SearchableSelect, custom values are first-class.
//
// Used for fields where we have a recommended list but don't want to
// force it on the user (e.g. Industry: standard buckets cover ~90%
// of clients, but the recruiter might want "Edtech & K-12" or
// something we haven't catalogued yet).

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click-outside closes the popover. Re-uses the standard mousedown
  // pattern so it co-exists with other dropdown components on the
  // same page (the calendar event Related-to picker was its template).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // While typing, filter the list to options that contain the
  // current value (case-insensitive). Empty value shows the full
  // catalog. The user can still pick a filtered match OR submit
  // whatever they typed — the input value is the source of truth.
  const filtered =
    value.trim().length > 0
      ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
      : options;

  // If what the user typed exactly matches an existing option we
  // don't need to show "+ Add <value>" — it's already in the list.
  const exactMatch = options.some(
    (o) => o.toLowerCase() === value.trim().toLowerCase(),
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-9 py-2 text-sm",
            "ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-label="Toggle options"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open && (filtered.length > 0 || (value.trim() && !exactMatch)) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
                inputRef.current?.blur();
              }}
              className={cn(
                "block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50",
                opt === value && "bg-indigo-50 text-indigo-700",
              )}
            >
              {opt}
            </button>
          ))}
          {value.trim() && !exactMatch && (
            <div className="px-3 py-1.5 text-xs text-gray-400 border-t bg-gray-50">
              Or use &ldquo;{value.trim()}&rdquo; as a custom value.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
