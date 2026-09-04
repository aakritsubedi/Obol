import type { BlocksReport, ProviderSummary, Summary, SummaryToday, WidgetConfig } from "@obol/contract";
import type { CcusageReport } from "../data/ccusage/types.js";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";
import { evaluateBudget } from "./budget.js";
import { dateForTimeZone, type TimeSource } from "./time.js";

function periodMatchesToday(period: string, today: string): boolean {
  const normalized = period.replace(/[^0-9]/g, "");
  const compactToday = today.replace(/-/g, "");
  return period === today || normalized === compactToday || period.startsWith(today);
}

function periodMatchesMonth(period: string, month: string): boolean {
  const normalized = period.replace(/[^0-9]/g, "");
  const compactMonth = month.replace(/-/g, "");
  return period === month || normalized === compactMonth || period.startsWith(month);
}

function emptyToday(): SummaryToday {
  return {
    period: "",
    totalCost: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    modelsUsed: [],
    modelBreakdowns: [],
  };
}

function providerSummaries(row: Record<string, unknown>): ProviderSummary[] {
  const values = Array.isArray(row.agents) ? row.agents : [];
  return values.map((value, index) => {
    const agent = asRecord(value);
    const name = stringValue(agent.agent ?? agent.name ?? agent.provider, `provider-${index + 1}`);
    return {
      ...agent,
      agent: name,
      totalCost: numberValue(agent.totalCost),
      totalTokens: numberValue(agent.totalTokens),
      inputTokens: numberValue(agent.inputTokens),
      outputTokens: numberValue(agent.outputTokens),
      cacheCreationTokens: numberValue(agent.cacheCreationTokens),
      cacheReadTokens: numberValue(agent.cacheReadTokens),
    };
  });
}

export function buildSummary(
  report: CcusageReport,
  blocks: BlocksReport,
  config: WidgetConfig,
  updatedAt: string | null,
  stale: boolean,
  error: string | null,
  time: TimeSource,
): Summary {
  const todayKey = dateForTimeZone(time.now(), time.timeZone());
  const todayRow = report.daily.find((row) => periodMatchesToday(row.period, todayKey));
  const currentMonth = todayKey.slice(0, 7);
  const currentMonthRow = report.monthly.find((row) => periodMatchesMonth(row.period, currentMonth));
  const today = todayRow ?? emptyToday();
  const budget = evaluateBudget(today.totalCost, currentMonthRow?.totalCost ?? 0, config);

  return {
    today: {
      ...today,
      period: today.period || todayKey,
      totalCost: numberValue(today.totalCost),
      totalTokens: numberValue(today.totalTokens),
      inputTokens: numberValue(today.inputTokens),
      outputTokens: numberValue(today.outputTokens),
      cacheCreationTokens: numberValue(today.cacheCreationTokens),
      cacheReadTokens: numberValue(today.cacheReadTokens),
      modelsUsed: Array.isArray(today.modelsUsed) ? today.modelsUsed : [],
      modelBreakdowns: Array.isArray(today.modelBreakdowns) ? today.modelBreakdowns : [],
    },
    agents: providerSummaries(today),
    burnRate: blocks.burnRate,
    projection: blocks.projection,
    budgetStatus: budget.status,
    budget,
    updatedAt,
    stale,
    error,
  };
}
