import type { UsageRow } from "../api";
import { formatCurrency, formatTokens, numberValue } from "./format";

export type ContributionState =
  | "before-data"
  | "future"
  | "empty"
  | "level-1"
  | "level-2"
  | "level-3"
  | "level-4";

export interface ContributionDay {
  key: string;
  date: Date;
  tokens: number;
  cost: number;
  state: ContributionState;
  /** Zero is the empty square; one through four are the increasing color levels. */
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  tooltip: string[];
}

export interface ContributionWeek {
  key: string;
  days: Array<ContributionDay | null>;
}

export interface ContributionMonthLabel {
  key: string;
  label: string;
  weekIndex: number;
}

export interface ContributionCalendar {
  year: number;
  days: ContributionDay[];
  weeks: ContributionWeek[];
  monthLabels: ContributionMonthLabel[];
}

function keyFor(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function noon(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function shortDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

function fullDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function contributionLevel(tokens: number, thresholds: [number, number, number]): 1 | 2 | 3 | 4 {
  if (tokens < thresholds[0]) return 1;
  if (tokens < thresholds[1]) return 2;
  if (tokens < thresholds[2]) return 3;
  return 4;
}

function levelThresholds(values: number[]): [number, number, number] {
  const positive = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (!positive.length) return [0, 0, 0];
  const valueAt = (ratio: number): number => {
    const position = Math.min(positive.length - 1, Math.max(0, Math.floor(ratio * positive.length)));
    return positive[position];
  };
  return [valueAt(0.25), valueAt(0.5), valueAt(0.75)];
}

function tooltipFor(
  day: Pick<ContributionDay, "date" | "tokens" | "cost" | "state">,
  dataStart: Date | null,
  locale?: string,
): string[] {
  const title = fullDate(day.date, locale);
  if (day.state === "before-data") {
    return [title, dataStart ? `No data before ${shortDate(dataStart, locale)}` : "No data available"];
  }
  if (day.state === "future") return [title, "Future date"];
  if (day.tokens <= 0 && day.cost <= 0) return [title, "No activity recorded"];
  return [
    title,
    `${formatTokens(day.tokens, locale)} tokens burned`,
    `${formatCurrency(day.cost, locale)} total cost`,
  ];
}

export function buildContributionCalendar(
  rows: UsageRow[],
  now: Date,
  locale?: string,
): ContributionCalendar {
  const year = now.getFullYear();
  const start = new Date(year, 0, 1, 12);
  const end = new Date(year, 11, 31, 12);
  // Local calendar fields avoid the UTC day shift in positive-offset zones.
  const todayKey = keyFor(new Date(now));
  const startKey = keyFor(start);
  const endKey = keyFor(end);
  const usageByKey = new Map<string, { tokens: number; cost: number }>();

  for (const row of rows) {
    const key = String(row.period || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key < startKey || key > endKey) continue;
    const current = usageByKey.get(key) || { tokens: 0, cost: 0 };
    current.tokens += numberValue(row.totalTokens);
    current.cost += numberValue(row.totalCost);
    usageByKey.set(key, current);
  }

  const dataStartKey = [...usageByKey.entries()]
    .filter(([, usage]) => usage.tokens > 0 || usage.cost > 0)
    .map(([key]) => key)
    .sort()[0];
  const dataStart = dataStartKey ? noon(dataStartKey) : null;
  const thresholds = levelThresholds([...usageByKey.values()].map((usage) => usage.tokens));
  const days: ContributionDay[] = [];

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const stableDate = new Date(date);
    const key = keyFor(stableDate);
    const usage = usageByKey.get(key) || { tokens: 0, cost: 0 };
    const state: ContributionState =
      dataStartKey && key < dataStartKey
        ? "before-data"
        : key > todayKey
          ? "future"
          : usage.tokens > 0 || usage.cost > 0
            ? `level-${contributionLevel(usage.tokens, thresholds)}`
            : "empty";
    const level: 0 | 1 | 2 | 3 | 4 = state.startsWith("level-")
      ? (Number(state.slice(6)) as 1 | 2 | 3 | 4)
      : 0;
    const base = { key, date: stableDate, tokens: usage.tokens, cost: usage.cost, state, level };
    days.push({
      ...base,
      label: `${fullDate(stableDate, locale)}: ${formatTokens(usage.tokens, locale)} tokens, ${formatCurrency(
        usage.cost,
        locale,
      )} total cost`,
      tooltip: tooltipFor(base, dataStart, locale),
    });
  }

  const weeks: ContributionWeek[] = [];
  let currentWeek: ContributionDay[] = [];

  for (const day of days) {
    if (day.date.getDay() === 0 && currentWeek.length) {
      weeks.push({ key: currentWeek[0].key, days: currentWeek });
      currentWeek = [];
    }
    currentWeek.push(day);
  }
  if (currentWeek.length) weeks.push({ key: currentWeek[0].key, days: currentWeek });

  // Pad the first and last partial weeks so the CSS grid keeps GitHub's
  // Sunday-through-Saturday alignment without rendering out-of-year cells.
  const alignedWeeks: ContributionWeek[] = weeks.map((weekItem) => ({
    key: weekItem.key,
    days: [...weekItem.days],
  }));
  while ((alignedWeeks[0]?.days.length || 7) < 7) alignedWeeks[0]?.days.unshift(null);
  const lastWeek = alignedWeeks.at(-1);
  while (lastWeek && lastWeek.days.length < 7) lastWeek.days.push(null);

  const monthLabels: ContributionMonthLabel[] = [];
  alignedWeeks.forEach((weekItem, index) => {
    const first = weekItem.days.find(Boolean);
    if (!first) return;
    const month = first.date.getMonth();
    if (monthLabels.some((label) => label.key.endsWith(`-${month}`))) return;
    monthLabels.push({
      key: `${first.key}-${month}`,
      label: new Intl.DateTimeFormat(locale, { month: "short" }).format(first.date),
      weekIndex: index,
    });
  });

  return { year, days, weeks: alignedWeeks, monthLabels };
}

/** Keep the current and past portion of the calendar for static exports. */
export function trimFutureContribution(calendar: ContributionCalendar): ContributionCalendar {
  const weeks = calendar.weeks
    .map((week) => ({
      ...week,
      days: week.days.map((day) => (day?.state === "future" ? null : day)),
    }))
    .filter((week) => week.days.some(Boolean));
  const lastWeekIndex = weeks.length - 1;

  return {
    ...calendar,
    weeks,
    monthLabels: calendar.monthLabels.filter((month) => month.weekIndex <= lastWeekIndex),
  };
}
