import { modelName } from "@shared/analytics/totals";
import type { ModelBreakdown, Report, Summary, UsageRow } from "@shared/api";
import { formatCurrency, formatPeriod, formatTokens, numberValue } from "@shared/lib/format";

export type ShareRange = "today" | "week" | "month" | "total";

export interface ShareModel {
  model: string;
  provider: string;
  cost: number;
  tokens: number;
}

export const SHARE_TOP_MODEL_COUNT = 4;
export const SHARE_ADDITIONAL_MODEL_COUNT = 5;
export const SHARE_TOKEN_WEIGHT = 0.6;
export const SHARE_COST_WEIGHT = 0.4;

export interface ShareData {
  rangeLabel: string;
  dateLabel: string;
  cost: number;
  tokens: number;
  models: ShareModel[];
  modelCount: number;
  trackedSince: string;
  dailyRows: UsageRow[];
}

export interface ModelTotals {
  cost: number;
  tokens: number;
}

export const shareRanges: Array<{ value: ShareRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "total", label: "Total" },
];

function rangeRows(report: Report | null, summary: Summary, range: ShareRange): UsageRow[] {
  const rows = report?.daily || [];
  const today = summary.today.period.slice(0, 10);
  if (range === "total") return rows;
  if (!today) return [];
  if (range === "today") return rows.filter((row) => row.period.slice(0, 10) === today);
  if (range === "month") return rows.filter((row) => row.period.slice(0, 7) === today.slice(0, 7));
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - 6);
  const start = date.toISOString().slice(0, 10);
  return rows.filter((row) => row.period.slice(0, 10) >= start && row.period.slice(0, 10) <= today);
}

function breakdownForRow(row: {
  modelBreakdowns?: ModelBreakdown[];
  agents?: Array<{ agent?: string; modelBreakdowns?: ModelBreakdown[] }>;
}) {
  const nested = (row.agents || []).flatMap((agent) =>
    (agent.modelBreakdowns || []).map((model) => ({ model, provider: String(agent.agent || "Unknown") })),
  );
  if (nested.length) return nested;
  return (row.modelBreakdowns || []).map((model) => ({ model, provider: String(model.agent || "Unknown") }));
}

function modelTokens(model: ModelBreakdown): number {
  const explicit = Number(model.totalTokens);
  if (Number.isFinite(explicit)) return explicit;
  return ["inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens"].reduce(
    (sum, key) => sum + numberValue(model[key]),
    0,
  );
}

function modelTotals(models: ShareModel[]): ModelTotals {
  return models.reduce(
    (totals, model) => ({
      cost: totals.cost + Math.max(0, model.cost),
      tokens: totals.tokens + Math.max(0, model.tokens),
    }),
    { cost: 0, tokens: 0 },
  );
}

/** Rank models using comparable metric shares rather than raw dollars plus tokens. */
export function weightedModelScore(model: ShareModel, totals: ModelTotals): number {
  const tokenShare = totals.tokens > 0 ? Math.max(0, model.tokens) / totals.tokens : 0;
  const costShare = totals.cost > 0 ? Math.max(0, model.cost) / totals.cost : 0;
  return tokenShare * SHARE_TOKEN_WEIGHT + costShare * SHARE_COST_WEIGHT;
}

export function rankShareModels(models: ShareModel[]): ShareModel[] {
  const totals = modelTotals(models);
  return [...models].sort((left, right) => {
    const scoreDifference = weightedModelScore(right, totals) - weightedModelScore(left, totals);
    if (scoreDifference !== 0) return scoreDifference;
    return (
      right.tokens - left.tokens ||
      right.cost - left.cost ||
      left.provider.localeCompare(right.provider) ||
      left.model.localeCompare(right.model)
    );
  });
}

export function visibleShareModels(models: ShareModel[]): ShareModel[] {
  return rankShareModels(models).slice(0, SHARE_TOP_MODEL_COUNT + SHARE_ADDITIONAL_MODEL_COUNT);
}

export function buildShareData(report: Report | null, summary: Summary, range: ShareRange): ShareData {
  const rows = rangeRows(report, summary, range);
  const fallback = range === "today" ? summary.today : null;
  const cost = rows.length
    ? rows.reduce((sum, row) => sum + numberValue(row.totalCost), 0)
    : fallback?.totalCost || 0;
  const tokens = rows.length
    ? rows.reduce((sum, row) => sum + numberValue(row.totalTokens), 0)
    : fallback?.totalTokens || 0;
  const models = new Map<string, ShareModel>();
  for (const row of rows) {
    for (const entry of breakdownForRow(row)) {
      const key = `${entry.provider}\u0000${modelName(entry.model)}`;
      const current = models.get(key) || {
        model: modelName(entry.model),
        provider: entry.provider,
        cost: 0,
        tokens: 0,
      };
      current.cost += numberValue(entry.model.totalCost ?? entry.model.cost);
      current.tokens += modelTokens(entry.model);
      models.set(key, current);
    }
  }
  if (!models.size && fallback) {
    for (const entry of fallback.modelBreakdowns || []) {
      const key = `fallback\u0000${modelName(entry)}`;
      models.set(key, {
        model: modelName(entry),
        provider: String(entry.agent || "Unknown"),
        cost: numberValue(entry.totalCost ?? entry.cost),
        tokens: modelTokens(entry),
      });
    }
  }
  const first = report?.daily[0]?.period || summary.today.period;
  const dateLabel =
    range === "total"
      ? "All tracked usage"
      : range === "month"
        ? "Current month"
        : range === "week"
          ? "Trailing 7 days"
          : formatPeriod(summary.today.period);
  return {
    rangeLabel: shareRanges.find((item) => item.value === range)?.label || "Usage",
    dateLabel,
    cost,
    tokens,
    models: visibleShareModels([...models.values()]),
    modelCount: models.size,
    trackedSince: first ? formatPeriod(first) : "usage began",
    dailyRows: report?.daily || [],
  };
}

export function usageComments(data: ShareData) {
  return [
    { value: formatCurrency(data.cost), label: "spend" },
    { value: formatTokens(data.tokens), label: "tokens 🔥" },
    { value: String(data.modelCount), label: "models 🤖" },
  ];
}
