import type { CcusageReport, CcusageRow } from "../data/ccusage/types.js";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";

export interface LocalUsageRow {
  date: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  totalCost: number;
  billing: "subscription";
  credits?: number;
}

type Period = "daily" | "weekly" | "monthly";

const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/g;

/** Add token-priced local-provider rows to the normalized ccusage report. */
export function mergeLocalUsage(report: CcusageReport, rows: LocalUsageRow[]): CcusageReport {
  if (rows.length === 0) return report;

  const merged: CcusageReport = {
    ...report,
    daily: mergePeriod(report.daily, rows, "daily"),
    weekly: mergePeriod(report.weekly, rows, "weekly"),
    monthly: mergePeriod(report.monthly, rows, "monthly"),
    session: [...report.session],
    projects: [...report.projects],
    ...(report.projectPaths ? { projectPaths: { ...report.projectPaths } } : {}),
    totals: { ...report.totals },
  };

  for (const row of rows) addTotals(merged.totals, row);
  return merged;
}

function mergePeriod(existing: CcusageRow[], rows: LocalUsageRow[], period: Period): CcusageRow[] {
  const merged = existing.map(cloneRow);
  for (const usage of rows) {
    let index = merged.findIndex((row) => periodContainsDate(row.period, usage.date, period));
    if (index < 0) {
      merged.push(emptyRow(periodFor(usage.date, period)));
      index = merged.length - 1;
    }
    const current = merged[index];
    if (current) merged[index] = addUsage(current, usage);
  }
  return merged.sort((left, right) => left.period.localeCompare(right.period));
}

function cloneRow(row: CcusageRow): CcusageRow {
  return {
    ...row,
    agents: row.agents.map((agent) => ({
      ...agent,
      ...(Array.isArray(agent.modelBreakdowns)
        ? { modelBreakdowns: agent.modelBreakdowns.map((model) => ({ ...asRecord(model) })) }
        : {}),
    })),
    modelBreakdowns: row.modelBreakdowns.map((model) => ({ ...model })),
    modelsUsed: [...row.modelsUsed],
    metadata: { ...row.metadata },
  };
}

function emptyRow(period: string): CcusageRow {
  return {
    period,
    agents: [],
    modelBreakdowns: [],
    modelsUsed: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0,
    totalTokens: 0,
    metadata: {},
  };
}

function addUsage(row: CcusageRow, usage: LocalUsageRow): CcusageRow {
  const breakdown = breakdownFor(usage);
  const modelBreakdowns = addBreakdown(row.modelBreakdowns, breakdown, false);
  const agents: Array<Record<string, unknown>> = row.agents.map((agent) => ({
    ...agent,
    ...(Array.isArray(agent.modelBreakdowns)
      ? { modelBreakdowns: agent.modelBreakdowns.map((model) => ({ ...asRecord(model) })) }
      : {}),
  }));
  const agentIndex = agents.findIndex(
    (agent) => stringValue(agent.agent ?? agent.name ?? agent.provider) === usage.agent,
  );
  const agent =
    agentIndex >= 0
      ? {
          ...agents[agentIndex],
          totalCost: numberValue(agents[agentIndex].totalCost) + usage.totalCost,
          totalTokens: numberValue(agents[agentIndex].totalTokens) + usage.totalTokens,
          inputTokens: numberValue(agents[agentIndex].inputTokens) + usage.inputTokens,
          outputTokens: numberValue(agents[agentIndex].outputTokens) + usage.outputTokens,
          cacheCreationTokens:
            numberValue(agents[agentIndex].cacheCreationTokens) + usage.cacheCreationTokens,
          cacheReadTokens: numberValue(agents[agentIndex].cacheReadTokens) + usage.cacheReadTokens,
          billing: "subscription",
          modelBreakdowns: addBreakdown(
            Array.isArray(agents[agentIndex].modelBreakdowns)
              ? agents[agentIndex].modelBreakdowns.map((model) => asRecord(model))
              : [],
            breakdown,
            true,
          ),
        }
      : {
          agent: usage.agent,
          totalCost: usage.totalCost,
          totalTokens: usage.totalTokens,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          cacheReadTokens: usage.cacheReadTokens,
          billing: "subscription",
          modelBreakdowns: [breakdown],
        };
  if (agentIndex >= 0) agents[agentIndex] = agent;
  else agents.push(agent);

  return {
    ...row,
    agents,
    modelBreakdowns,
    modelsUsed: row.modelsUsed.includes(usage.model) ? row.modelsUsed : [...row.modelsUsed, usage.model],
    inputTokens: numberValue(row.inputTokens) + usage.inputTokens,
    outputTokens: numberValue(row.outputTokens) + usage.outputTokens,
    cacheCreationTokens: numberValue(row.cacheCreationTokens) + usage.cacheCreationTokens,
    cacheReadTokens: numberValue(row.cacheReadTokens) + usage.cacheReadTokens,
    totalCost: numberValue(row.totalCost) + usage.totalCost,
    totalTokens: numberValue(row.totalTokens) + usage.totalTokens,
  };
}

function breakdownFor(usage: LocalUsageRow): Record<string, unknown> {
  return {
    model: usage.model,
    agent: usage.agent,
    totalCost: usage.totalCost,
    cost: usage.totalCost,
    totalTokens: usage.totalTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    cacheReadTokens: usage.cacheReadTokens,
    ...(usage.credits === undefined ? {} : { credits: usage.credits }),
  };
}

function addBreakdown(
  values: Array<Record<string, unknown>>,
  addition: Record<string, unknown>,
  matchAgent: boolean,
): Array<Record<string, unknown>> {
  const model = stringValue(addition.model ?? addition.modelName);
  const agent = stringValue(addition.agent);
  const index = values.findIndex(
    (value) =>
      stringValue(value.model ?? value.modelName ?? value.name) === model &&
      (!matchAgent || stringValue(value.agent) === agent),
  );
  if (index < 0) return [...values, { ...addition }];
  const current = values[index];
  const next = {
    ...current,
    totalCost: numberValue(current.totalCost ?? current.cost) + numberValue(addition.totalCost),
    cost: numberValue(current.cost ?? current.totalCost) + numberValue(addition.cost),
    totalTokens: numberValue(current.totalTokens) + numberValue(addition.totalTokens),
    inputTokens: numberValue(current.inputTokens) + numberValue(addition.inputTokens),
    outputTokens: numberValue(current.outputTokens) + numberValue(addition.outputTokens),
    cacheCreationTokens: numberValue(current.cacheCreationTokens) + numberValue(addition.cacheCreationTokens),
    cacheReadTokens: numberValue(current.cacheReadTokens) + numberValue(addition.cacheReadTokens),
    ...(addition.credits === undefined
      ? {}
      : { credits: numberValue(current.credits) + numberValue(addition.credits) }),
  };
  return values.map((value, valueIndex) => (valueIndex === index ? next : value));
}

function addTotals(totals: Record<string, unknown>, row: LocalUsageRow): void {
  totals.inputTokens = numberValue(totals.inputTokens) + row.inputTokens;
  totals.outputTokens = numberValue(totals.outputTokens) + row.outputTokens;
  totals.cacheCreationTokens = numberValue(totals.cacheCreationTokens) + row.cacheCreationTokens;
  totals.cacheReadTokens = numberValue(totals.cacheReadTokens) + row.cacheReadTokens;
  totals.totalCost = numberValue(totals.totalCost) + row.totalCost;
  totals.totalTokens = numberValue(totals.totalTokens) + row.totalTokens;
}

function periodContainsDate(periodValue: string, date: string, period: Period): boolean {
  const periodText = String(periodValue);
  if (period === "daily")
    return periodText === date || periodText.replace(/[^0-9]/g, "") === date.replace(/-/g, "");
  if (period === "monthly") return periodText.startsWith(date.slice(0, 7));

  const dates = periodText.match(DATE_PATTERN) ?? [];
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  if (dates.length >= 2 && startDate && endDate) return startDate <= date && date <= endDate;
  if (dates.length === 1 && startDate) {
    const start = Date.parse(`${startDate}T12:00:00Z`);
    const target = Date.parse(`${date}T12:00:00Z`);
    return (
      Number.isFinite(start) && Number.isFinite(target) && target >= start && target < start + 7 * 86_400_000
    );
  }
  return false;
}

function periodFor(date: string, period: Period): string {
  if (period === "daily") return date;
  if (period === "monthly") return date.slice(0, 7);
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
  return value.toISOString().slice(0, 10);
}
