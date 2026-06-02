"use client";

import { useState } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

// Numeric input that displays with US-style thousand separators when
// blurred ("3,500,000") and raw digits when focused ("3500000") so
// editing doesn't have to fight the cursor against shifting commas.
//
// Storage is always the raw numeric string — onChange(rawValue) — so
// callers can keep passing `Number(value)` to APIs unchanged. The
// formatter only touches what the user sees.
//
// en-US format on purpose. Target market is US recruiters; consistent
// formatting across browsers regardless of locale means a placement
// entered by an Argentine recruiter still reads the same way for the
// US clients on their team.
//
// Use this anywhere money-like figures live: salaries, fees, payment
// terms days, guarantee periods. The thousand-separators only render
// for values ≥ 1000, so "30" (days) stays "30".

type MoneyInputProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  // Optional leading-edge overlay like "$" or "%". When set the
  // input gets pl-7 to leave room.
  prefix?: string;
  // Optional trailing-edge overlay like a currency code. Less common.
  suffix?: string;
  // Allow decimal entry. Default true so "150.5" works. Set false
  // for integer-only inputs (days, openings).
  allowDecimal?: boolean;
};

export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  className,
  disabled,
  required,
  prefix,
  suffix,
  allowDecimal = true,
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false);

  function format(raw: string): string {
    if (!raw) return "";
    // Allow an in-progress decimal trailing dot ("150." while typing).
    const m = raw.match(/^(-?\d+)(\.\d*)?$/);
    if (!m) return raw;
    const intPart = Number(m[1]).toLocaleString("en-US");
    return intPart + (m[2] || "");
  }

  function sanitize(input: string): string {
    // Strip commas (we inserted them) and any other non-numeric chars
    // except a single decimal point (or none, depending on prop).
    const stripped = input.replace(/[^\d.]/g, "");
    if (!allowDecimal) return stripped.replace(/\./g, "");
    // Collapse multiple dots to just the first.
    const firstDot = stripped.indexOf(".");
    if (firstDot < 0) return stripped;
    return stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, "");
  }

  const display = focused ? value : format(value);

  return (
    <div className={prefix || suffix ? "relative" : undefined}>
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
          {prefix}
        </span>
      )}
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        value={display}
        onChange={(e) => onChange(sanitize(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(prefix && "pl-7", suffix && "pr-12", className)}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
