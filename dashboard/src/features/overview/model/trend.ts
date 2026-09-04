import { rangeRows } from "@shared/analytics/ranges";
import type { Report, Summary } from "@shared/api";
import { dateKey, periodDate } from "@shared/lib/date";

export interface Last7Summary {
  totalCost: number;
  totalTokens: number;
  activeDays: number;
  averageDaily: number;
}

export function loadingSummary(): Summary {
  return {
    today: {
      period: "",
      totalCost: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelsUsed: [],
      modelBreakdowns: [],
    },
    agents: [],
    burnRate: { costPerHour: 0 },
    projection: { totalCost: 0 },
    budgetStatus: "ok",
    budget: { status: "ok", dailyRatio: null, monthlyRatio: null, reason: null },
    updatedAt: null,
    stale: true,
    error: null,
  };
}

export { dateKey, periodDate, rangeRows };

function comparison(delta: number, baseline: number) {
  return { delta, ratio: baseline > 0 ? delta / baseline : null, baseline };
}

// The hero card summarizes a trailing 7-day window ending today. It is
// deliberately not the calendar week: the leaders section owns Sun–Sat and
// says so, so the two windows never share one ambiguous "this week" label.
export function weekSummaryFor(report: Report | null, todayPeriod: string): Last7Summary {
  const empty: Last7Summary = { totalCost: 0, totalTokens: 0, activeDays: 0, averageDaily: 0 };
  if (!report || !todayPeriod || periodDate(todayPeriod) === null) return empty;

  const todayKey = todayPeriod.slice(0, 10);
  const today = new Date(`${todayKey}T12:00:00`);
  if (!Number.isFinite(today.valueOf())) return empty;

  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const weekStart = dateKey(start);
  const dailyRows = report.daily.filter((row) => {
    const key = row.period.slice(0, 10);
    return key >= weekStart && key <= todayKey;
  });
  const totalCost = dailyRows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalTokens = dailyRows.reduce((sum, row) => sum + row.totalTokens, 0);
  const activeDays = dailyRows.filter((row) => row.totalCost > 0).length;

  return {
    totalCost,
    totalTokens,
    activeDays,
    averageDaily: activeDays ? totalCost / activeDays : 0,
  };
}

export function trailingDailyTrend(report: Report | null, todayPeriod: string) {
  if (!report || !todayPeriod) return { points: [], averageDaily: 0, comparison: null };
  const todayKey = todayPeriod.slice(0, 10);
  const points = report.daily
    .filter((row) => row.period.slice(0, 10) <= todayKey)
    .slice(-30)
    .map((row) => ({ period: row.period, value: row.totalCost }));
  const prior = points.filter((point) => point.period.slice(0, 10) < todayKey);
  const averageDaily = prior.length ? prior.reduce((sum, point) => sum + point.value, 0) / prior.length : 0;
  const today = points.at(-1)?.value || 0;
  return {
    points,
    averageDaily,
    comparison: averageDaily > 0 ? comparison(today - averageDaily, averageDaily) : null,
  };
}
