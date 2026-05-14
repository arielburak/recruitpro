// Exchange-rate fetcher + cache for /placements. Uses the free,
// no-auth open.er-api.com endpoint (USD-based rates). Caches in
// localStorage for 24h so we don't hit the API every time the page
// renders — open.er-api caps free usage at ~1500 requests/month,
// and rates barely move within a day anyway.
//
// Server-side caching would be cleaner long-term (one fetch per app,
// shared across users) but for an MVP single-org tracking ledger
// this is enough. ROADMAP carries the "move to server" follow-up.

type RatesPayload = {
  base: "USD";
  rates: Record<string, number>;
  fetchedAt: number; // epoch ms
};

const CACHE_KEY = "recruitpro:exchange-rates-usd:v1";
const TTL_MS = 24 * 60 * 60 * 1000;
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

function readCache(): RatesPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatesPayload;
    if (!parsed.rates || typeof parsed.fetchedAt !== "number") return null;
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: RatesPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage can be disabled / full — silent fallback to per-load fetch
  }
}

/**
 * Returns a map of currency code → rate against USD (1 USD = N units of
 * that currency). Returns null when the fetch fails and there's no
 * usable cache — callers should fall back to showing the per-currency
 * breakdown instead of a single unified number.
 */
export async function fetchUsdRates(): Promise<Record<string, number> | null> {
  const cached = readCache();
  if (cached) return cached.rates;

  try {
    const res = await fetch(RATES_URL);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.result !== "success" || !data.rates) return null;
    const payload: RatesPayload = {
      base: "USD",
      rates: data.rates,
      fetchedAt: Date.now(),
    };
    writeCache(payload);
    return payload.rates;
  } catch {
    return null;
  }
}

/**
 * Convert `amount` from `fromCurrency` to USD. Returns null when no
 * conversion is possible (unknown currency or missing rates).
 */
export function convertToUsd(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number> | null,
): number | null {
  if (fromCurrency === "USD") return amount;
  if (!rates) return null;
  const rate = rates[fromCurrency];
  if (!rate || rate === 0) return null;
  return amount / rate;
}
