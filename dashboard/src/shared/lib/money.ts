import type { MoneyDisplay } from "./format";

// The same public API the menu bar app reads. No key, no account, one daily
// reference rate per currency.
const HOST = "https://api.frankfurter.dev/v2";
const CACHE_KEY = "obol-rates";
// Reference rates are published once per business day; re-reading more often
// than this buys nothing.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const USD: MoneyDisplay = { code: "USD", rate: 1 };

interface CachedRate {
  rate: number;
  fetchedAt: number;
}

interface RateRow {
  base: string;
  quote: string;
  rate: number;
  date: string;
}

function readCache(): Record<string, CachedRate> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, CachedRate>) : {};
  } catch {
    // A private window, or storage the browser refuses. Rates are a
    // convenience cache; losing them costs one request.
    return {};
  }
}

function writeCache(cache: Record<string, CachedRate>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* not worth failing a render over */
  }
}

function cached(code: string): CachedRate | null {
  const entry = readCache()[code];
  return entry && Number.isFinite(entry.rate) && entry.rate > 0 ? entry : null;
}

async function fetchRate(code: string): Promise<number> {
  const url = `${HOST}/rates?base=USD&quotes=${encodeURIComponent(code)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`exchange rate service returned ${response.status}`);
  const rows = (await response.json()) as RateRow[];
  const row = Array.isArray(rows) ? rows.find((entry) => entry.quote === code) : undefined;
  if (!row || !Number.isFinite(row.rate) || row.rate <= 0) {
    throw new Error(`no exchange rate published for ${code}`);
  }
  return row.rate;
}

/**
 * The display setting for a configured currency code.
 *
 * Falls back to USD whenever a rate cannot be established, so an unreachable
 * rate service shows honest dollars rather than dollar figures wearing another
 * currency's label.
 */
export async function loadMoneyDisplay(code: string, sharedRate?: number | null): Promise<MoneyDisplay> {
  const normalized = String(code || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized) || normalized === "USD") return USD;

  // The native app is the owner of the exchange-rate cache. Prefer its value
  // when the daemon includes one so both surfaces render the same conversion,
  // even when a browser cannot reach the public rate service directly.
  if (typeof sharedRate === "number" && Number.isFinite(sharedRate) && sharedRate > 0) {
    return { code: normalized, rate: sharedRate };
  }

  const entry = cached(normalized);
  if (entry && Date.now() - entry.fetchedAt < MAX_AGE_MS) {
    return { code: normalized, rate: entry.rate };
  }

  try {
    const rate = await fetchRate(normalized);
    writeCache({ ...readCache(), [normalized]: { rate, fetchedAt: Date.now() } });
    return { code: normalized, rate };
  } catch {
    // A stale rate still labels the amounts correctly; only a complete absence
    // of one sends the page back to dollars.
    return entry ? { code: normalized, rate: entry.rate } : USD;
  }
}
