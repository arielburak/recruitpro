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
 * Best-effort display formats per country. `#` = digit placeholder,
 * any other character is a literal separator. These cover the common
 * national formats; edge cases (e.g. Brazilian 8-digit numbers) still
 * render readably because extra digits spill past the template.
 */
const PHONE_FORMATS: Record<string, string> = {
  "+54": "## ####-####",     // AR
  "+1": "(###) ###-####",    // US / CA
  "+55": "## #####-####",    // BR
  "+56": "# #### ####",      // CL
  "+57": "### ### ####",     // CO
  "+52": "## #### ####",     // MX
  "+51": "### ### ###",      // PE
  "+598": "#### ####",       // UY
  "+595": "### ### ###",     // PY
  "+591": "#### ####",       // BO
  "+593": "## ### ####",     // EC
  "+58": "###-#######",      // VE
  "+44": "#### ######",      // GB
  "+34": "### ### ###",      // ES
  "+33": "# ## ## ## ##",    // FR
  "+49": "### #######",      // DE
  "+39": "### ### ####",     // IT
  "+351": "### ### ###",     // PT
  "+31": "## ### ####",      // NL
  "+41": "## ### ## ##",     // CH
  "+61": "### ### ###",      // AU
  "+81": "### #### ####",    // JP
  "+86": "### #### ####",    // CN
  "+91": "##### #####",      // IN
  "+972": "## ### ####",     // IL
  "+971": "## ### ####",     // AE
};

function formatPhoneNumber(value: string, prefix: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const template = PHONE_FORMATS[prefix];
  if (!template) return digits;

  let out = "";
  let i = 0;
  for (const char of template) {
    if (i >= digits.length) break;
    if (char === "#") {
      out += digits[i];
      i++;
    } else {
      out += char;
    }
  }
  // Any digits beyond the template length spill over without separators
  // rather than being truncated — better UX for numbers longer than we expected.
  if (i < digits.length) out += digits.slice(i);
  return out;
}

/**
 * Build an example placeholder for a given prefix. Counts the digit
 * slots in the template and emits exactly that many sequential digits,
 * so the example fits the format instead of spilling extra digits past
 * the template (which was rendering "12 3456-7890123456" for AR).
 */
function examplePlaceholder(prefix: string): string {
  const template = PHONE_FORMATS[prefix];
  if (!template) return "1234567890";
  const digitCount = (template.match(/#/g) || []).length;
  const digits = Array.from({ length: digitCount }, (_, i) =>
    String((i + 1) % 10),
  ).join("");
  return formatPhoneNumber(digits, prefix);
}

// Map ISO-3166-2 country code → dial code we know about. Used to derive a
// sensible default from the browser locale so a user signing up from the US
// doesn't see "+54" pre-filled.
const COUNTRY_TO_DIAL: Record<string, string> = COUNTRY_CODES.reduce(
  (acc, c) => {
    acc[c.country] = c.code;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Best-effort country guess from the browser. Reads `navigator.language`
 * (e.g. "es-AR", "en-US") and falls back to the timezone if the locale has
 * no region tag. Returns null when we can't tell — caller decides the
 * fallback dial code. Server-side this returns null because `navigator` is
 * not defined; the prefix is then set on hydration via useEffect.
 */
function detectBrowserDialCode(): string | null {
  if (typeof navigator === "undefined") return null;

  const langs: string[] = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter(Boolean) as string[];

  for (const lang of langs) {
    const region = lang.split("-")[1]?.toUpperCase();
    if (region && COUNTRY_TO_DIAL[region]) return COUNTRY_TO_DIAL[region];
  }

  // Fallback: extract country from IANA timezone (e.g. America/Argentina/Buenos_Aires).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("Argentina")) return "+54";
    if (tz.startsWith("America/") && !tz.includes("Argentina")) return "+1";
    if (tz.startsWith("Europe/London")) return "+44";
    if (tz.startsWith("Europe/Madrid")) return "+34";
    if (tz.startsWith("Europe/Paris")) return "+33";
  } catch {
    // ignore — Intl missing or restricted
  }

  return null;
}

/**
 * Parse existing phone value into prefix + number.
 * Handles "+54 11 1234-5678", "+1 555-1234", or just "11 1234-5678".
 * When no value is provided the prefix defaults to the user's locale, with
 * "+54" as the final fallback.
 */
function parsePhone(value: string): { prefix: string; number: string } {
  if (!value) {
    return { prefix: detectBrowserDialCode() ?? "+54", number: "" };
  }
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

  // No prefix in the input — fall back to the locale-derived default.
  return { prefix: detectBrowserDialCode() ?? "+54", number: trimmed };
}

interface PhoneInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (fullValue: string) => void;
  name?: string;
  className?: string;
  placeholder?: string;
  compact?: boolean; // For inline table editing
  highlighted?: boolean; // Draws attention (e.g. duplicate match detected)
}

export function PhoneInput({
  value,
  defaultValue,
  onChange,
  name,
  className = "",
  placeholder,
  compact = false,
  highlighted = false,
}: PhoneInputProps) {
  const initial = parsePhone(value || defaultValue || "");
  const [prefix, setPrefix] = useState(initial.prefix);
  const [number, setNumber] = useState(formatPhoneNumber(initial.number, initial.prefix));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync if controlled value changes externally
  useEffect(() => {
    if (value !== undefined) {
      const parsed = parsePhone(value);
      setPrefix(parsed.prefix);
      setNumber(formatPhoneNumber(parsed.number, parsed.prefix));
    }
  }, [value]);

  // After hydration, swap the SSR fallback prefix ("+54") for one derived
  // from the user's browser locale — but only when there's no value yet and
  // the user hasn't already picked a country. This avoids the awkward case
  // where a US recruiter sees "+54" pre-filled.
  useEffect(() => {
    if (value || defaultValue || number) return;
    const detected = detectBrowserDialCode();
    if (detected && detected !== prefix) setPrefix(detected);
    // Run once on mount; later edits should keep the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Re-format the existing digits with the new country's template so the
    // UI stays consistent when a recruiter switches countries mid-edit.
    const reformatted = formatPhoneNumber(number, code);
    setNumber(reformatted);
    if (onChange) {
      onChange(reformatted ? `${code} ${reformatted}` : "");
    }
  }

  function handleNumberChange(val: string) {
    const formatted = formatPhoneNumber(val, prefix);
    setNumber(formatted);
    if (onChange) {
      onChange(formatted ? `${prefix} ${formatted}` : "");
    }
  }

  const height = compact ? "h-8" : "h-10";
  const borderColor = highlighted ? "border-indigo-400" : "border-input";
  const wrapperHighlight = highlighted
    ? "rounded-md ring-2 ring-indigo-100"
    : "";

  return (
    <div className={`flex ${wrapperHighlight} ${className}`}>
      {name && <input type="hidden" name={name} value={fullValue} />}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 ${height} px-2 border ${borderColor} border-r-0 rounded-l-md bg-gray-50 hover:bg-gray-100 text-sm transition-colors whitespace-nowrap`}
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
        className={`flex ${height} w-full rounded-r-md border ${borderColor} bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        placeholder={placeholder ?? examplePlaceholder(prefix)}
        value={number}
        onChange={(e) => handleNumberChange(e.target.value)}
      />
    </div>
  );
}
