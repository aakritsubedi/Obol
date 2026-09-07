import { estimateCost, type PricingTable, priceFor } from "../domain/pricing.js";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";
import type { CcusageReport, CcusageRow } from "./ccusage/types.js";

interface RepricedRows<T extends CcusageRow> {
  rows: T[];
  delta: number;
}

function modelName(value: Record<string, unknown>): string {
  return stringValue(value.model ?? value.modelName ?? value.name).trim();
}

function repriceBreakdown(
  value: Record<string, unknown>,
  pricing: PricingTable,
): {
  value: Record<string, unknown>;
  delta: number;
} {
  const model = modelName(value);
  if (!model || !priceFor(model, pricing)) return { value: { ...value }, delta: 0 };

  const nextCost = estimateCost(
    model,
    {
      inputTokens: numberValue(value.inputTokens),
      outputTokens: numberValue(value.outputTokens),
      cacheReadTokens: numberValue(value.cacheReadTokens),
      cacheCreationTokens: numberValue(value.cacheCreationTokens),
    },
    pricing,
  );
  const previousCost = numberValue(value.totalCost ?? value.cost);
  return {
    value: { ...value, totalCost: nextCost, cost: nextCost },
    delta: nextCost - previousCost,
  };
}

function repriceRow<T extends CcusageRow>(row: T, pricing: PricingTable): { row: T; delta: number } {
  const topLevel = row.modelBreakdowns.map((value) => repriceBreakdown(value, pricing));
  const topLevelDelta = topLevel.reduce((sum, value) => sum + value.delta, 0);
  let agentDelta = 0;
  const agents = row.agents.map((value) => {
    const agent = asRecord(value);
    if (!Array.isArray(agent.modelBreakdowns)) return { ...agent };
    const breakdowns = agent.modelBreakdowns.map((model) => repriceBreakdown(asRecord(model), pricing));
    const delta = breakdowns.reduce((sum, model) => sum + model.delta, 0);
    agentDelta += delta;
    return {
      ...agent,
      totalCost: numberValue(agent.totalCost) + delta,
      modelBreakdowns: breakdowns.map((model) => model.value),
    };
  });
  const delta = topLevel.length > 0 ? topLevelDelta : agentDelta;
  return {
    row: {
      ...row,
      agents,
      modelBreakdowns: topLevel.map((value) => value.value),
      totalCost: numberValue(row.totalCost) + delta,
    } as T,
    delta,
  };
}

function repriceRows<T extends CcusageRow>(rows: T[], pricing: PricingTable): RepricedRows<T> {
  let delta = 0;
  const repriced = rows.map((row) => {
    const next = repriceRow(row, pricing);
    delta += next.delta;
    return next.row;
  });
  return { rows: repriced, delta };
}

/** Replaces ccusage's embedded model prices where the downloaded table knows the model. */
export function repriceReport(report: CcusageReport, pricing: PricingTable): CcusageReport {
  const daily = repriceRows(report.daily, pricing);
  const weekly = repriceRows(report.weekly, pricing);
  const monthly = repriceRows(report.monthly, pricing);
  const session = repriceRows(report.session, pricing);
  const projects = repriceRows(report.projects, pricing);
  return {
    ...report,
    daily: daily.rows,
    weekly: weekly.rows,
    monthly: monthly.rows,
    session: session.rows,
    projects: projects.rows,
    totals: {
      ...report.totals,
      totalCost: numberValue(report.totals.totalCost) + daily.delta,
    },
  };
}
