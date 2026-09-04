export function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Formatting functions accept an optional locale so tests can pin output;
// at runtime they default to the user's locale, as before.

export interface MoneyDisplay {
  /** ISO 4217 code the amounts are rendered in. */
  code: string;
  /** Multiplier from the USD figures the daemon reports. 1 for USD. */
  rate: number;
}

// The display currency is chosen in the menu bar app and applies to every
// amount on the page at once, so it lives here as one module-level setting
// rather than being threaded through the ~45 call sites below. Every cost the
// daemon reports — and everything the exports write — stays in USD; the
// conversion happens here, at the moment of rendering.
let money: MoneyDisplay = { code: "USD", rate: 1 };

export function setMoneyDisplay(next: MoneyDisplay): void {
  money = Number.isFinite(next.rate) && next.rate > 0 ? next : { code: "USD", rate: 1 };
}

export function moneyDisplay(): MoneyDisplay {
  return money;
}

export function formatCurrency(value: unknown, locale?: string, display: MoneyDisplay = money): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: display.code,
    maximumFractionDigits: 2,
  }).format(numberValue(value) * display.rate);
}

/**
 * Font size for a hero amount, shrinking as the amount gets longer so it stays
 * inside its card.
 *
 * "$17.26" and "NPR 283,484.36" are the same figure in two currencies, and a
 * size picked for the first overflows the card with the second. The width is
 * expressed in container query units so it tracks the card rather than the
 * viewport — the card must set `container-type: inline-size`. 0.58em is about
 * the advance of one bold tabular digit, and `padding` is the card's own
 * horizontal padding, which container units include but the text cannot use.
 */
export function heroFontSize(text: string, max: number, padding = 48): string {
  const ems = Math.max(text.length, 1) * 0.58;
  return `clamp(24px, calc((100cqi - ${padding}px) / ${ems.toFixed(2)}), ${max}px)`;
}

export function formatSignedCurrency(value: unknown, locale?: string): string {
  const number = numberValue(value);
  return `${number < 0 ? "−" : "+"}${formatCurrency(Math.abs(number), locale)}`;
}

export function formatPercent(value: unknown, digits = 2, locale?: string): string {
  const number = numberValue(value);
  const formatted = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(number));
  return `${number < 0 ? "−" : "+"}${formatted}`;
}

/**
 * Magnitude only, no sign. Used where an arrow or an adjacent word already
 * carries the direction, so the reader is not told twice.
 */
export function formatPercentMagnitude(value: unknown, digits = 1, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(numberValue(value)));
}

export function formatTokens(value: unknown, locale?: string): string {
  const number = numberValue(value);
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat(locale).format(number);
}

export function formatDuration(value: unknown): string {
  const minutes = Math.max(0, Math.round(numberValue(value)));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function formatPeriod(period: string, locale?: string): string {
  if (!period) return "—";
  const date = new Date(`${period.length === 7 ? `${period}-01` : period.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return period;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

export function displayName(value: unknown, fallback = "Unknown"): string {
  const name = String(value ?? "").trim();
  if (!name) return fallback;
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function projectName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!name) return "Unknown project";
  const pieces = name.split("-").filter(Boolean);
  return displayName(pieces[pieces.length - 1] || name, "Unknown project");
}

export function formatRelativeTime(value: unknown): string {
  if (!value) return "No activity";
  const timestamp = new Date(String(value)).valueOf();
  if (!Number.isFinite(timestamp)) return "No activity";
  const delta = Date.now() - timestamp;
  const future = delta < 0;
  const seconds = Math.round(Math.abs(delta) / 1000);
  if (seconds < 45) return future ? "in a moment" : "just now";
  if (seconds < 3_600) {
    const minutes = Math.round(seconds / 60);
    return future ? `in ${minutes}m` : `${minutes}m ago`;
  }
  if (seconds < 86_400) {
    const hours = Math.round(seconds / 3_600);
    return future ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.round(seconds / 86_400);
  return future ? `in ${days}d` : `${days}d ago`;
}

export function formatUpdatedAt(iso: unknown, locale?: string): string {
  if (!iso) return "Waiting for usage";
  const date = new Date(String(iso));
  if (Number.isNaN(date.valueOf())) return "Waiting for usage";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
