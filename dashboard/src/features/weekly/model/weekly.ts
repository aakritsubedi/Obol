import type { ModelBreakdown, ProjectUsageRow, UsageRow } from "@shared/api";
import { dateKey } from "@shared/lib/date";
import { projectName } from "@shared/lib/format";

export { dateKey } from "@shared/lib/date";

export interface WeekRange {
  start: string;
  end: string;
}

export interface UsageTotals {
  cost: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface LeaderRow extends UsageTotals {
  name: string;
  costDelta: number;
  costRatio: number | null;
  /** Same weekdays last week, so the UI can name what a runaway ratio grew from. */
  costBaseline: number;
  tokenDelta: number;
  tokenRatio: number | null;
  tokenBaseline: number;
}

export type LeaderMetric = "cost" | "tokens";

/**
 * Above this the percentage stops carrying information. A model that cost NPR
 * 63 last week and NPR 2,000 this week is "+3,041%", which says nothing that
 * "barely used last week" does not - and printed in the same column as "+15%"
 * it drags the eye to the least meaningful row on the page.
 */
export const RATIO_CAP = 9.995;

export type DeltaKind =
  /** No usage at all in the comparison window. */
  | "first-week"
  /** A baseline so small the ratio is noise; report the baseline instead. */
  | "negligible"
  | "unchanged"
  | "up"
  | "down";

export function deltaKind(ratio: number | null): DeltaKind {
  if (ratio === null) return "first-week";
  if (ratio > RATIO_CAP) return "negligible";
  if (Math.abs(ratio) < 0.0005) return "unchanged";
  return ratio > 0 ? "up" : "down";
}

const MODEL_NAME_MAP: Record<string, string> = {
  xpreviewffree: "X Preview (free)",
};

export function normalizeModelName(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unknown model";
  const mapped = MODEL_NAME_MAP[raw.toLowerCase().replace(/[^a-z0-9]/g, "")];
  if (mapped) return mapped;
  return raw
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ");
}

const zeroUsage: UsageTotals = {
  cost: 0,
  tokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
};

export function weekRange(now: Date): WeekRange {
  const sunday = new Date(now);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 6);
  return { start: dateKey(sunday), end: dateKey(saturday) };
}

function shiftKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00`);
  if (!Number.isFinite(date.valueOf())) return key;
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function daysBetween(startKey: string, endKey: string): number {
  const start = new Date(`${startKey}T12:00:00`).valueOf();
  const end = new Date(`${endKey}T12:00:00`).valueOf();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 6;
  return Math.round((end - start) / 86_400_000);
}

export function previousWeek(range: WeekRange): WeekRange {
  return { start: shiftKey(range.start, -7), end: shiftKey(range.end, -7) };
}

// A calendar week in progress must be compared against the same slice of the
// previous week — Sunday through today, not Sunday through Saturday — or the
// percentages just measure how much of the week has elapsed. `dayIndex` is
// zero-based so callers can render a "Day N of 7" badge.
export function weekToDateRanges(now: Date): { current: WeekRange; previous: WeekRange; dayIndex: number } {
  const full = weekRange(now);
  const dayIndex = Math.min(6, Math.max(0, daysBetween(full.start, dateKey(now))));
  const previousStart = shiftKey(full.start, -7);
  return {
    current: { start: full.start, end: shiftKey(full.start, dayIndex) },
    previous: { start: previousStart, end: shiftKey(previousStart, dayIndex) },
    dayIndex,
  };
}

export function formatWeekRange(range: WeekRange, locale?: string): string {
  const start = new Date(`${range.start}T12:00:00`);
  const end = new Date(`${range.end}T12:00:00`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return `${range.start} – ${range.end}`;
  }
  if (range.start === range.end) {
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(
      start,
    );
  }
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function inWeek(period: string, range: WeekRange): boolean {
  const key = period.slice(0, 10);
  return key >= range.start && key <= range.end;
}

type TotalsMap = Map<string, UsageTotals>;

function addUsage(map: TotalsMap, key: string, usage: UsageTotals): void {
  const current = map.get(key) || zeroUsage;
  map.set(key, {
    cost: current.cost + usage.cost,
    tokens: current.tokens + usage.tokens,
    inputTokens: current.inputTokens + usage.inputTokens,
    outputTokens: current.outputTokens + usage.outputTokens,
    cacheReadTokens: current.cacheReadTokens + usage.cacheReadTokens,
  });
}

function breakdownCost(breakdown: ModelBreakdown): number {
  const cost = typeof breakdown.totalCost === "number" ? breakdown.totalCost : breakdown.cost;
  const parsed = Number(cost);
  return Number.isFinite(parsed) ? parsed : 0;
}

function breakdownTokenField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function breakdownTokens(breakdown: ModelBreakdown): number {
  const explicit = Number(breakdown.totalTokens);
  if (Number.isFinite(explicit)) return explicit;
  return (
    breakdownTokenField(breakdown.inputTokens) +
    breakdownTokenField(breakdown.outputTokens) +
    breakdownTokenField(breakdown.cacheCreationTokens) +
    breakdownTokenField(breakdown.cacheReadTokens)
  );
}

function breakdownTotals(breakdown: ModelBreakdown): UsageTotals {
  const inputTokens = breakdownTokenField(breakdown.inputTokens);
  const outputTokens = breakdownTokenField(breakdown.outputTokens);
  const cacheReadTokens = breakdownTokenField(breakdown.cacheReadTokens);
  return {
    cost: breakdownCost(breakdown),
    tokens: breakdownTokens(breakdown),
    inputTokens,
    outputTokens,
    cacheReadTokens,
  };
}

export function aggregateModels(rows: UsageRow[], range: WeekRange): TotalsMap {
  const grouped: TotalsMap = new Map();
  for (const row of rows) {
    if (!inWeek(row.period, range)) continue;
    for (const breakdown of row.modelBreakdowns || []) {
      const name = String(breakdown.modelName ?? breakdown.model ?? breakdown.name ?? "Unknown model").trim();
      addUsage(grouped, name || "Unknown model", breakdownTotals(breakdown));
    }
  }
  return grouped;
}

export function aggregateProviders(rows: UsageRow[], range: WeekRange): TotalsMap {
  const grouped: TotalsMap = new Map();
  for (const row of rows) {
    if (!inWeek(row.period, range)) continue;
    for (const agent of row.agents || []) {
      const name = String(agent.agent ?? agent.name ?? agent.provider ?? "Unknown provider").trim();
      addUsage(grouped, name || "Unknown provider", {
        cost: breakdownTokenField(agent.totalCost),
        tokens: breakdownTokenField(agent.totalTokens),
        inputTokens: breakdownTokenField(agent.inputTokens),
        outputTokens: breakdownTokenField(agent.outputTokens),
        cacheReadTokens: breakdownTokenField(agent.cacheReadTokens),
      });
    }
  }
  return grouped;
}

export function aggregateProjects(rows: ProjectUsageRow[], range: WeekRange): TotalsMap {
  const grouped: TotalsMap = new Map();
  for (const row of rows) {
    if (!inWeek(row.period, range)) continue;
    addUsage(grouped, projectName(row.project).toLowerCase(), {
      cost: breakdownTokenField(row.totalCost),
      tokens: breakdownTokenField(row.totalTokens),
      inputTokens: breakdownTokenField(row.inputTokens),
      outputTokens: breakdownTokenField(row.outputTokens),
      cacheReadTokens: breakdownTokenField(row.cacheReadTokens),
    });
  }
  return grouped;
}

export function leaderRows(current: TotalsMap, last: TotalsMap, metric: LeaderMetric): LeaderRow[] {
  const rows: LeaderRow[] = [];
  for (const [name, usage] of current) {
    if (usage.cost <= 0 && usage.tokens <= 0) continue;
    const before = last.get(name) || zeroUsage;
    rows.push({
      name,
      cost: usage.cost,
      tokens: usage.tokens,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      costDelta: usage.cost - before.cost,
      costRatio: before.cost > 0 ? (usage.cost - before.cost) / before.cost : null,
      costBaseline: before.cost,
      tokenDelta: usage.tokens - before.tokens,
      tokenRatio: before.tokens > 0 ? (usage.tokens - before.tokens) / before.tokens : null,
      tokenBaseline: before.tokens,
    });
  }
  rows.sort((left, right) => right[metric] - left[metric] || left.name.localeCompare(right.name));
  return rows;
}
