import { modelName } from "@shared/analytics/totals";
import type { ModelBreakdown, Report, UsageRow } from "@shared/api";
import { numberValue } from "@shared/lib/format";

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
