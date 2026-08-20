export function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value: unknown): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(numberValue(value));
}

export function formatSignedCurrency(value: unknown): string {
  const number = numberValue(value);
  return `${number < 0 ? "−" : "+"}${formatCurrency(Math.abs(number))}`;
}

export function formatPercent(value: unknown, digits = 2): string {
  const number = numberValue(value);
  const formatted = new Intl.NumberFormat(undefined, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Math.abs(number));
  return `${number < 0 ? "−" : "+"}${formatted}`;
}

export function formatTokens(value: unknown): string {
  const number = numberValue(value);
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat().format(number);
}

export function formatDuration(value: unknown): string {
  const minutes = Math.max(0, Math.round(numberValue(value)));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function formatPeriod(period: string): string {
  if (!period) return "—";
  const date = new Date(`${period.length === 7 ? `${period}-01` : period.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return period;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function displayName(value: unknown, fallback = "Unknown"): string {
  const name = String(value ?? "").trim();
  if (!name) return fallback;
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

export function formatUpdatedAt(iso: unknown): string {
  if (!iso) return "Waiting for usage";
  const date = new Date(String(iso));
  if (Number.isNaN(date.valueOf())) return "Waiting for usage";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
