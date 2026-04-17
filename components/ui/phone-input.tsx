"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

const COUNTRY_CODES = [
  { code: "+54", country: "AR", flag: "🇦🇷", label: "Argentina" },
  { code: "+1", country: "US", flag: "🇺🇸", label: "United States" },
  { code: "+55", country: "BR", flag: "🇧🇷", label: "Brazil" },
  { code: "+56", country: "CL", flag: "🇨🇱", label: "Chile" },
  { code: "+57", country: "CO", flag: "🇨🇴", label: "Colombia" },
  { code: "+52", country: "MX", flag: "🇲🇽", label: "Mexico" },
  { code: "+51", country: "PE", flag: "🇵🇪", label: "Peru" },
  { code: "+598", country: "UY", flag: "🇺🇾", label: "Uruguay" },
  { code: "+595", country: "PY", flag: "🇵🇾", label: "Paraguay" },
  { code: "+591", country: "BO", flag: "🇧🇴", label: "Bolivia" },
  { code: "+593", country: "EC", flag: "🇪🇨", label: "Ecuador" },
  { code: "+58", country: "VE", flag: "🇻🇪", label: "Venezuela" },
  { code: "+44", country: "GB", flag: "🇬🇧", label: "United Kingdom" },
  { code: "+34", country: "ES", flag: "🇪🇸", label: "Spain" },
  { code: "+33", country: "FR", flag: "🇫🇷", label: "France" },
  { code: "+49", country: "DE", flag: "🇩🇪", label: "Germany" },
  { code: "+39", country: "IT", flag: "🇮🇹", label: "Italy" },
  { code: "+351", country: "PT", flag: "🇵🇹", label: "Portugal" },
  { code: "+31", country: "NL", flag: "🇳🇱", label: "Netherlands" },
  { code: "+41", country: "CH", flag: "🇨🇭", label: "Switzerland" },
  { code: "+61", country: "AU", flag: "🇦🇺", label: "Australia" },
  { code: "+81", country: "JP", flag: "🇯🇵", label: "Japan" },
  { code: "+86", country: "CN", flag: "🇨🇳", label: "China" },
  { code: "+91", country: "IN", flag: "🇮🇳", label: "India" },
  { code: "+972", country: "IL", flag: "🇮🇱", label: "Israel" },
  { code: "+971", country: "AE", flag: "🇦🇪", label: "UAE" },
];

/**
 * Parse existing phone value into prefix + number.
 * Handles "+54 11 1234-5678", "+1 555-1234", or just "11 1234-5678"
 */
function parsePhone(value: string): { prefix: string; number: string } {
  if (!value) return { prefix: "+54", number: "" };
  const trimmed = value.trim();

  // Try to match a known country code at the start
  if (trimmed.startsWith("+")) {
    for (const cc of COUNTRY_CODES) {
      if (trimmed.startsWith(cc.code)) {
        const rest = trimmed.slice(cc.code.length).replace(/^[\s-]+/, "");
        return { prefix: cc.code, number: rest };
      }
    }
    // Unknown prefix - try to extract it
    const match = trimmed.match(/^(\+\d{1,4})\s*(.*)/);
    if (match) return { prefix: match[1], number: match[2] };
  }

  // No prefix found - default to AR
  return { prefix: "+54", number: trimmed };
}

interface PhoneInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (fullValue: string) => void;
  name?: string;
  className?: string;
  placeholder?: string;
  compact?: boolean; // For inline table editing
}

export function PhoneInput({
  value,
  defaultValue,
  onChange,
  name,
  className = "",
  placeholder = "11 1234-5678",
  compact = false,
}: PhoneInputProps) {
  const initial = parsePhone(value || defaultValue || "");
  const [prefix, setPrefix] = useState(initial.prefix);
  const [number, setNumber] = useState(initial.number);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync if controlled value changes externally
  useEffect(() => {
    if (value !== undefined) {
      const parsed = parsePhone(value);
      setPrefix(parsed.prefix);
      setNumber(parsed.number);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fullValue = number ? `${prefix} ${number}` : "";
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === prefix) || COUNTRY_CODES[0];

  const filteredCodes = search
    ? COUNTRY_CODES.filter(
        (c) =>
          c.label.toLowerCase().includes(search.toLowerCase()) ||
          c.code.includes(search) ||
          c.country.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRY_CODES;

  function handlePrefixChange(code: string) {
    setPrefix(code);
    setOpen(false);
    setSearch("");
    if (onChange) {
      onChange(number ? `${code} ${number}` : "");
    }
  }

  function handleNumberChange(val: string) {
    setNumber(val);
    if (onChange) {
      onChange(val ? `${prefix} ${val}` : "");
    }
  }

  const height = compact ? "h-8" : "h-10";

  return (
    <div className={`flex ${className}`}>
      {name && <input type="hidden" name={name} value={fullValue} />}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 ${height} px-2 border border-r-0 rounded-l-md bg-gray-50 hover:bg-gray-100 text-sm transition-colors whitespace-nowrap`}
        >
          <span>{selectedCountry.flag}</span>
          <span className="text-gray-600 text-xs">{prefix}</span>
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </button>
        {open && (
          <div className="absolute z-50 mt-1 left-0 w-56 bg-white border rounded-md shadow-lg max-h-56 overflow-hidden">
            <div className="p-1.5 border-b">
              <input
                type="text"
                className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-indigo-300"
                placeholder="Search country..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-44">
              {filteredCodes.map((c) => (
                <button
                  key={c.code + c.country}
                  type="button"
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-indigo-50 transition-colors ${
                    c.code === prefix ? "bg-indigo-50 text-indigo-700" : ""
                  }`}
                  onClick={() => handlePrefixChange(c.code)}
                >
                  <span>{c.flag}</span>
                  <span className="flex-1">{c.label}</span>
                  <span className="text-gray-400 text-xs">{c.code}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <input
        type="tel"
        className={`flex ${height} w-full rounded-r-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        placeholder={placeholder}
        value={number}
        onChange={(e) => handleNumberChange(e.target.value)}
      />
    </div>
  );
}
