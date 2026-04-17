"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  meta?: string; // optional right-aligned context (like count or type)
  color?: string; // optional color dot
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allLabel?: string; // label for the "all" option (value === "all")
  className?: string;
  minWidth?: number;
  disabled?: boolean;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  allLabel = "All",
  className,
  minWidth = 160,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Add "All" option at the top
  const allOptions: SearchableSelectOption[] = [
    { value: "all", label: allLabel },
    ...options,
  ];

  const filtered = query.trim()
    ? allOptions.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : allOptions;

  const selected = allOptions.find((o) => o.value === value);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)} style={{ minWidth }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "hover:bg-gray-50 cursor-pointer"
        )}
      >
        <span className={cn("truncate", !selected && "text-gray-400")}>
          {selected ? (
            <span className="flex items-center gap-1.5">
              {selected.color && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: selected.color }}
                />
              )}
              {selected.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-100 p-1.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-8 py-1 text-sm bg-transparent outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">No matches</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors",
                      value === opt.value && "bg-emerald-50/60 text-emerald-700"
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {opt.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color }}
                        />
                      )}
                      <span className="truncate">{opt.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {opt.meta && (
                        <span className="text-[11px] text-gray-400">{opt.meta}</span>
                      )}
                      {value === opt.value && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
