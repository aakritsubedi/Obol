import type { ModelBreakdown, Report, ReportTotals, UsageRow } from "../api";
import { numberValue } from "./format";

export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface AggregatedModel extends ModelBreakdown {
  model: string;
  agent?: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ProviderGroup {
  agent: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  models: AggregatedModel[];
}

const zeroTotals: ReportTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0,
  totalTokens: 0,
};

export function modelName(model: ModelBreakdown): string {
  return String(model.modelName ?? model.model ?? model.name ?? "Unknown model");
}

function metric(model: ModelBreakdown, key: keyof AggregatedModel): number {
  if (key === "totalCost") return numberValue(model.totalCost ?? model.cost);
  if (key === "totalTokens") {
    const explicit = Number(model.totalTokens);
    if (Number.isFinite(explicit)) return explicit;
    return ["inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens"].reduce(
      (sum, tokenKey) => sum + numberValue(model[tokenKey]),
      0,
    );
  }
  return numberValue(model[key]);
}

function emptyModel(name: string, agent?: string): AggregatedModel {
  return {
    model: name,
    ...(agent ? { agent } : {}),
    totalCost: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };
}

function addModel(target: AggregatedModel, value: ModelBreakdown): void {
  target.totalCost += metric(value, "totalCost");
  target.totalTokens += metric(value, "totalTokens");
  target.inputTokens += metric(value, "inputTokens");
  target.outputTokens += metric(value, "outputTokens");
  target.cacheCreationTokens += metric(value, "cacheCreationTokens");
  target.cacheReadTokens += metric(value, "cacheReadTokens");
}

export function modelRowsFor(report: Report, period: ReportPeriod): UsageRow[] {
  const rows = report[period];
  return rows.length ? [rows[rows.length - 1]] : [];
}

function rowsFor(report: Report, period?: ReportPeriod): UsageRow[] {
  if (period) return modelRowsFor(report, period);
  return report.daily.length ? report.daily : report.weekly.length ? report.weekly : report.monthly;
}

export function periodHasModelData(report: Report, period: ReportPeriod): boolean {
  return modelRowsFor(report, period).some(
    (row) =>
      row.modelBreakdowns.length > 0 ||
      row.agents.some((agent) => Array.isArray(agent.modelBreakdowns) && agent.modelBreakdowns.length > 0),
  );
}

function reduceRows(report: Report): ReportTotals {
  return report.daily.reduce<ReportTotals>(
    (totals, row) => {
      totals.inputTokens += numberValue(row.inputTokens);
      totals.outputTokens += numberValue(row.outputTokens);
      totals.cacheCreationTokens += numberValue(row.cacheCreationTokens);
      totals.cacheReadTokens += numberValue(row.cacheReadTokens);
      totals.totalCost += numberValue(row.totalCost);
      totals.totalTokens += numberValue(row.totalTokens);
      return totals;
    },
    { ...zeroTotals },
  );
}

export function totalsFrom(report: Report | null): ReportTotals {
  if (!report) return { ...zeroTotals };
  const reduced = reduceRows(report);
  const totals = report.totals;
  if (!totals) return reduced;
  return {
    inputTokens: Number.isFinite(Number(totals.inputTokens))
      ? numberValue(totals.inputTokens)
      : reduced.inputTokens,
    outputTokens: Number.isFinite(Number(totals.outputTokens))
      ? numberValue(totals.outputTokens)
      : reduced.outputTokens,
    cacheCreationTokens: Number.isFinite(Number(totals.cacheCreationTokens))
      ? numberValue(totals.cacheCreationTokens)
      : reduced.cacheCreationTokens,
    cacheReadTokens: Number.isFinite(Number(totals.cacheReadTokens))
      ? numberValue(totals.cacheReadTokens)
      : reduced.cacheReadTokens,
    totalCost: Number.isFinite(Number(totals.totalCost)) ? numberValue(totals.totalCost) : reduced.totalCost,
    totalTokens: Number.isFinite(Number(totals.totalTokens))
      ? numberValue(totals.totalTokens)
      : reduced.totalTokens,
  };
}

export function aggregateModels(report: Report, period?: ReportPeriod): AggregatedModel[] {
  const grouped = new Map<string, AggregatedModel>();
  for (const row of rowsFor(report, period)) {
    for (const value of row.modelBreakdowns || []) {
      const name = modelName(value);
      const current = grouped.get(name) || emptyModel(name);
      addModel(current, value);
      grouped.set(name, current);
    }
  }
  return [...grouped.values()].sort((a, b) => b.totalCost - a.totalCost);
}

export function aggregateByProvider(report: Report, period?: ReportPeriod): ProviderGroup[] {
  const grouped = new Map<string, ProviderGroup>();
  let foundBreakdowns = false;

  for (const row of rowsFor(report, period)) {
    for (const value of row.agents || []) {
      const agent = String(value.agent ?? value.name ?? value.provider ?? "Unknown provider");
      const breakdowns = Array.isArray(value.modelBreakdowns) ? value.modelBreakdowns : [];
      if (!breakdowns.length) continue;
      foundBreakdowns = true;
      const group = grouped.get(agent) || {
        agent,
        totalCost: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        models: [],
      };
      for (const value of breakdowns) {
        const name = modelName(value);
        const current = group.models.find((model) => model.model === name);
        const model = current || emptyModel(name, agent);
        addModel(model, value);
        if (!current) group.models.push(model);
      }
      group.totalCost = group.models.reduce((sum, model) => sum + model.totalCost, 0);
      group.totalTokens = group.models.reduce((sum, model) => sum + model.totalTokens, 0);
      group.inputTokens = group.models.reduce((sum, model) => sum + model.inputTokens, 0);
      group.outputTokens = group.models.reduce((sum, model) => sum + model.outputTokens, 0);
      group.cacheCreationTokens = group.models.reduce((sum, model) => sum + model.cacheCreationTokens, 0);
      group.cacheReadTokens = group.models.reduce((sum, model) => sum + model.cacheReadTokens, 0);
      grouped.set(agent, group);
    }
  }

  if (!foundBreakdowns) return [];
  return [...grouped.values()]
    .map((group) => ({ ...group, models: group.models.sort((a, b) => b.totalCost - a.totalCost) }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

export interface MonthProviderSpend {
  agent: string;
  totalCost: number;
  totalTokens: number;
}

export interface MonthProjection {
  /** Spend booked so far this calendar month. */
  monthToDate: number;
  /** Month-to-date extrapolated to the full month at the current daily pace. */
  projected: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** What the month has actually booked, all zero before the month has a row. */
  actual: ReportTotals;
  /** This month's spend per provider, dearest first. */
  providers: MonthProviderSpend[];
}

// A straight-line extrapolation, which is the honest one: the dashboard has no
// idea what the rest of the month holds, so it says "at this pace" and leaves
// it there. The actuals it extrapolates from travel with it, so the card can
// show what was really spent next to the guess.
export function monthProjection(report: Report | null, todayPeriod: string): MonthProjection {
  const month = todayPeriod.slice(0, 7);
  const row = month ? report?.monthly.find((entry) => entry.period.startsWith(month)) : undefined;
  const monthToDate = numberValue(row?.totalCost);
  const dayOfMonth = Number(todayPeriod.slice(8, 10)) || 0;
  const daysInMonth = dayOfMonth
    ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
    : 0;
  return {
    monthToDate,
    dayOfMonth,
    daysInMonth,
    projected: dayOfMonth && daysInMonth ? (monthToDate / dayOfMonth) * daysInMonth : 0,
    actual: row
      ? {
          inputTokens: numberValue(row.inputTokens),
          outputTokens: numberValue(row.outputTokens),
          cacheCreationTokens: numberValue(row.cacheCreationTokens),
          cacheReadTokens: numberValue(row.cacheReadTokens),
          totalCost: monthToDate,
          totalTokens: numberValue(row.totalTokens),
        }
      : { ...zeroTotals },
    // An agent with no spend this month is noise in a cost breakdown, so it is
    // dropped rather than listed at zero.
    providers: (row?.agents ?? [])
      .map((agent) => ({
        agent: String(agent.agent ?? "unknown"),
        totalCost: numberValue(agent.totalCost),
        totalTokens: numberValue(agent.totalTokens),
      }))
      .filter((agent) => agent.totalCost > 0 || agent.totalTokens > 0)
      .sort((left, right) => right.totalCost - left.totalCost),
  };
}

export type BudgetLevel = "ok" | "warn" | "over";

export interface BudgetOutlook {
  budget: number;
  projected: number;
  /** Projected spend as a share of the budget; above 1 the pace overshoots. */
  ratio: number;
  level: BudgetLevel;
  /** How far past the budget the pace lands, 0 while inside it. */
  overage: number;
}

/**
 * Whether this month's pace clears the monthly budget.
 *
 * This is the one place on the dashboard entitled to red: over means the
 * current pace ends the month past the budget. `warningThreshold` is the same
 * fraction the daemon and the menu bar use (config.warningThreshold, 0.8 by
 * default), so the page turns amber at the moment the tray icon does.
 */
export function budgetOutlook(
  projected: number,
  budget: number | null | undefined,
  warningThreshold = 0.8,
): BudgetOutlook | null {
  if (!budget || !Number.isFinite(budget) || budget <= 0) return null;
  const ratio = projected / budget;
  return {
    budget,
    projected,
    ratio,
    level: ratio > 1 ? "over" : ratio >= warningThreshold ? "warn" : "ok",
    overage: Math.max(0, projected - budget),
  };
}

// Cache reads bill at ~10% of the base input rate on every major provider, so
// each cached token saves roughly 90% of its uncached price. Per-model input
// prices are approximated by family; the estimate is labeled as such in the UI
// and errs toward the common Sonnet-class rate for unknown models.
const inputPricePerMillion: Array<[RegExp, number]> = [
  [/opus/i, 15],
  [/sonnet/i, 3],
  [/haiku/i, 0.8],
  [/gpt/i, 1.25],
  [/gemini/i, 1.25],
];

const defaultInputPricePerMillion = 3;
const cacheDiscount = 0.9;

export function inputPriceForModel(model: string): number {
  return inputPricePerMillion.find(([pattern]) => pattern.test(model))?.[1] ?? defaultInputPricePerMillion;
}

export interface CacheSavings {
  saved: number;
  cacheReadTokens: number;
  /** Share of all tokens that were discounted cache reads, null when unknown. */
  cacheShare: number | null;
}

export function estimateCacheSavings(report: Report | null): CacheSavings {
  if (!report) return { saved: 0, cacheReadTokens: 0, cacheShare: null };
  const daily = Array.isArray(report.daily) ? report.daily : [];
  const perModel = new Map<string, number>();
  let cacheReadTokens = 0;
  for (const row of daily) {
    for (const breakdown of row.modelBreakdowns || []) {
      const tokens = Number(breakdown.cacheReadTokens);
      if (!Number.isFinite(tokens) || tokens <= 0) continue;
      const name = modelName(breakdown);
      perModel.set(name, (perModel.get(name) || 0) + tokens);
      cacheReadTokens += tokens;
    }
  }
  let saved = 0;
  for (const [name, tokens] of perModel) {
    saved += tokens * (inputPriceForModel(name) / 1_000_000) * cacheDiscount;
  }
  const totals = daily.length ? totalsFrom(report) : null;
  const cacheShare =
    totals && totals.totalTokens > 0 && cacheReadTokens > 0 ? cacheReadTokens / totals.totalTokens : null;
  return { saved, cacheReadTokens, cacheShare };
}
