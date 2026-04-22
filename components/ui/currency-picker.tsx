"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { ChevronDown, Search } from "lucide-react";

/**
 * ISO 4217 currencies. Popular ones are listed first so the common case
 * doesn't require scrolling. Flag emojis use country codes as a visual cue.
 */
export const CURRENCIES: { code: string; symbol: string; name: string; flag: string }[] = [
  // Most used (shown at top)
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧" },
  { code: "ARS", symbol: "$", name: "Peso Argentino", flag: "🇦🇷" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", flag: "🇧🇷" },
  { code: "MXN", symbol: "$", name: "Mexican Peso", flag: "🇲🇽" },
  { code: "CLP", symbol: "$", name: "Chilean Peso", flag: "🇨🇱" },
  { code: "COP", symbol: "$", name: "Colombian Peso", flag: "🇨🇴" },
  { code: "PEN", symbol: "S/", name: "Peruvian Sol", flag: "🇵🇪" },
  { code: "UYU", symbol: "$U", name: "Uruguayan Peso", flag: "🇺🇾" },

  // Rest, alphabetical
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", flag: "🇦🇪" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "BOB", symbol: "Bs", name: "Bolivian Boliviano", flag: "🇧🇴" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc", flag: "🇨🇭" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", flag: "🇨🇳" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna", flag: "🇨🇿" },
  { code: "DKK", symbol: "kr", name: "Danish Krone", flag: "🇩🇰" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", flag: "🇭🇰" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint", flag: "🇭🇺" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", flag: "🇮🇩" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel", flag: "🇮🇱" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", flag: "🇮🇳" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "KRW", symbol: "₩", name: "South Korean Won", flag: "🇰🇷" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", flag: "🇲🇾" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone", flag: "🇳🇴" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", flag: "🇳🇿" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso", flag: "🇵🇭" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty", flag: "🇵🇱" },
  { code: "PYG", symbol: "₲", name: "Paraguayan Guarani", flag: "🇵🇾" },
  { code: "RON", symbol: "lei", name: "Romanian Leu", flag: "🇷🇴" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal", flag: "🇸🇦" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", flag: "🇸🇪" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬" },
  { code: "THB", symbol: "฿", name: "Thai Baht", flag: "🇹🇭" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira", flag: "🇹🇷" },
  { code: "TWD", symbol: "NT$", name: "Taiwan Dollar", flag: "🇹🇼" },
  { code: "VEF", symbol: "Bs", name: "Venezuelan Bolívar", flag: "🇻🇪" },
  { code: "ZAR", symbol: "R", name: "South African Rand", flag: "🇿🇦" },
];

export function getCurrency(code: string | null | undefined) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

/** Render a currency value for display, e.g. 1500 USD -> "$1,500" */
export function formatCurrencyValue(value: number | string | null | undefined, code: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "";
  const c = getCurrency(code);
  return `${c.symbol}${n.toLocaleString()} ${c.code}`;
}

interface CurrencyPickerProps {
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  name?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function CurrencyPicker({
  value,
  defaultValue,
  onChange,
  name,
  className = "",
  compact = false,
  disabled = false,
}: CurrencyPickerProps) {
  const initial = value || defaultValue || "USD";
  const [code, setCode] = useState(initial);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // When the trigger sits close to the right viewport edge, a left-anchored
  // dropdown (w-72) would extend past the page and cause horizontal scroll.
  // Measure on open and flip to right-anchored when needed.
  const [alignRight, setAlignRight] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Sync if controlled value changes externally
  useEffect(() => {
    if (value !== undefined) {
      setCode(value);
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

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const DROPDOWN_WIDTH = 288;
    setAlignRight(rect.left + DROPDOWN_WIDTH > window.innerWidth - 8);
  }, [open]);

  const selected = getCurrency(code);

  const filtered = search
    ? CURRENCIES.filter(
        (c) =>
          c.code.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.symbol.includes(search)
      )
    : CURRENCIES;

  function handleSelect(newCode: string) {
    setCode(newCode);
    setOpen(false);
    setSearch("");
    if (onChange) onChange(newCode);
  }

  const height = compact ? "h-8" : "h-10";

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={code} />}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 ${height} w-full px-3 border rounded-md bg-white hover:bg-gray-50 text-sm transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="text-gray-900 font-medium">{selected.code}</span>
        <span className="text-gray-400 text-xs">{selected.symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto" />
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 ${alignRight ? "right-0" : "left-0"} w-72 bg-white border rounded-md shadow-lg overflow-hidden`}>
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                className="w-full pl-7 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-indigo-300"
                placeholder="Search currency..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-64">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">No currencies match</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-indigo-50 transition-colors ${
                    c.code === code ? "bg-indigo-50 text-indigo-700" : ""
                  }`}
                  onClick={() => handleSelect(c.code)}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="font-medium w-12">{c.code}</span>
                  <span className="text-gray-500 text-xs w-8">{c.symbol}</span>
                  <span className="flex-1 text-gray-600 text-xs truncate">{c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
