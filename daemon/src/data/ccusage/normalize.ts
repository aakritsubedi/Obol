import type {
  BlocksReport,
  BurnRate,
  Projection,
  TokenCounts,
  TokenLimitStatus,
  UsageBlock,
} from "@obol/contract";
import { asRecord, numberValue, stringValue } from "../../shared/coerce.js";
import type { CcusageReport, CcusageRow, ProjectUsageRow } from "./types.js";

export function normalizeRow(value: unknown, index = 0): CcusageRow {
  const input = asRecord(value);
  const agents = Array.isArray(input.agents) ? input.agents.map((agent) => asRecord(agent)) : [];
  const modelBreakdowns = Array.isArray(input.modelBreakdowns)
    ? input.modelBreakdowns.map((model) => {
        const breakdown = asRecord(model);
        const totalTokens = numberValue(
          breakdown.totalTokens,
          numberValue(breakdown.inputTokens) +
            numberValue(breakdown.outputTokens) +
            numberValue(breakdown.cacheCreationTokens) +
            numberValue(breakdown.cacheReadTokens),
        );
        const totalCost = numberValue(breakdown.totalCost, numberValue(breakdown.cost));
        return {
          ...breakdown,
          totalCost,
          cost: numberValue(breakdown.cost, totalCost),
          totalTokens,
          inputTokens: numberValue(breakdown.inputTokens),
          outputTokens: numberValue(breakdown.outputTokens),
          cacheCreationTokens: numberValue(breakdown.cacheCreationTokens),
          cacheReadTokens: numberValue(breakdown.cacheReadTokens),
        };
      })
    : [];

  return {
    ...input,
    period: stringValue(input.period, `unknown-${index}`),
    agents,
    modelBreakdowns,
    modelsUsed: Array.isArray(input.modelsUsed) ? input.modelsUsed.map(String) : [],
    inputTokens: numberValue(input.inputTokens),
    outputTokens: numberValue(input.outputTokens),
    cacheCreationTokens: numberValue(input.cacheCreationTokens),
    cacheReadTokens: numberValue(input.cacheReadTokens),
    totalCost: numberValue(input.totalCost),
    totalTokens: numberValue(input.totalTokens),
    metadata: asRecord(input.metadata),
  };
}

export function normalizeReport(value: unknown): CcusageReport {
  const input = asRecord(value);
  const normalizeRows = (key: string): CcusageRow[] => {
    const values = input[key];
    if (!Array.isArray(values)) return [];
    return values.map((value, index) => {
      const row = asRecord(value);
      if (typeof row.period !== "string" && typeof row.period !== "number") {
        throw new Error(`ccusage report ${key}[${index}] is missing period`);
      }
      if (!("totalCost" in row) || !Number.isFinite(Number(row.totalCost))) {
        throw new Error(`ccusage report ${key}[${index}] is missing a numeric totalCost`);
      }
      return normalizeRow(row, index);
    });
  };
  const daily = normalizeRows("daily");
  const weekly = normalizeRows("weekly");
  const monthly = normalizeRows("monthly");
  const session = normalizeRows("session").sort((left, right) => right.totalCost - left.totalCost);
  const projects = normalizeProjectRows(input.projects);

  if (
    !(
      Array.isArray(input.daily) ||
      Array.isArray(input.weekly) ||
      Array.isArray(input.monthly) ||
      Array.isArray(input.session)
    )
  ) {
    throw new Error("ccusage report did not contain daily, weekly, monthly, or session arrays");
  }

  return {
    ...input,
    daily: sortRowsAscending(daily),
    weekly: sortRowsAscending(weekly),
    monthly: sortRowsAscending(monthly),
    session,
    projects,
    totals: asRecord(input.totals),
  };
}

function sortRowsAscending(rows: CcusageRow[]): CcusageRow[] {
  return [...rows].sort((left, right) => left.period.localeCompare(right.period));
}

function normalizeProjectRows(value: unknown): ProjectUsageRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = asRecord(item);
      const project = stringValue(row.project, "unknown-project");
      const period = stringValue(row.period ?? row.date, `unknown-${index}`);
      return {
        ...normalizeRow({ ...row, period, agent: stringValue(row.agent, "claude") }, index),
        project,
      };
    })
    .sort((left, right) => left.period.localeCompare(right.period) || right.totalCost - left.totalCost);
}

export function normalizeProjects(value: unknown): ProjectUsageRow[] {
  const input = asRecord(value);
  const projects = asRecord(input.projects);
  return Object.entries(projects)
    .flatMap(([project, rows]) => {
      if (!Array.isArray(rows)) return [];
      return rows.map((item, index) => {
        const row = asRecord(item);
        const period = stringValue(row.period ?? row.date, `unknown-${index}`);
        return {
          ...normalizeRow({ ...row, period, agent: stringValue(row.agent, "claude") }, index),
          project: stringValue(row.project, project),
        };
      });
    })
    .sort((left, right) => left.period.localeCompare(right.period) || right.totalCost - left.totalCost);
}

export function normalizeBlocks(value: unknown): BlocksReport {
  const input = Array.isArray(value) ? { blocks: value } : asRecord(value);
  if (!Array.isArray(input.blocks)) {
    throw new Error("ccusage blocks did not contain a blocks array");
  }
  const blocks = input.blocks.map((item, index) => normalizeBlock(item, index));
  const activeBlock =
    blocks.find((block) => block.isActive && !block.isGap) ??
    blocks.find((block) => !block.isGap) ??
    blocks[0];
  const burnRate = normalizeBurnRate({ ...asRecord(activeBlock?.burnRate), ...asRecord(input.burnRate) });
  const projection = normalizeProjection({
    ...asRecord(activeBlock?.projection),
    ...asRecord(input.projection),
  });
  const tokenLimitStatus = normalizeTokenLimitStatus(activeBlock?.tokenLimitStatus ?? input.tokenLimitStatus);

  return { blocks, burnRate, projection, tokenLimitStatus, raw: input };
}

function normalizeBlock(value: unknown, index: number): UsageBlock {
  const input = asRecord(value);
  const tokenCounts = asRecord(input.tokenCounts);
  const counts: TokenCounts = {
    ...tokenCounts,
    inputTokens: numberValue(tokenCounts.inputTokens),
    outputTokens: numberValue(tokenCounts.outputTokens),
    cacheCreationTokens: numberValue(tokenCounts.cacheCreationTokens ?? tokenCounts.cacheCreationInputTokens),
    cacheReadTokens: numberValue(tokenCounts.cacheReadTokens ?? tokenCounts.cacheReadInputTokens),
  };
  return {
    ...input,
    id: stringValue(input.id, `block-${index}`),
    startTime: stringValue(input.startTime),
    endTime: stringValue(input.endTime),
    actualEndTime:
      input.actualEndTime === null || input.actualEndTime === undefined
        ? null
        : stringValue(input.actualEndTime),
    isActive: input.isActive === true,
    isGap: input.isGap === true,
    entries: numberValue(input.entries),
    models: Array.isArray(input.models) ? input.models.map(String) : [],
    costUSD: numberValue(input.costUSD ?? input.totalCost ?? input.cost),
    totalTokens: numberValue(input.totalTokens),
    burnRate: normalizeBurnRate(input.burnRate),
    projection: normalizeProjection(input.projection),
    tokenCounts: counts,
    tokenLimitStatus: normalizeTokenLimitStatus(input.tokenLimitStatus),
  };
}

export function normalizeBurnRate(value: unknown): BurnRate {
  const input = asRecord(value);
  return {
    ...input,
    costPerHour: numberValue(input.costPerHour),
    ...(input.tokensPerMinute !== undefined ? { tokensPerMinute: numberValue(input.tokensPerMinute) } : {}),
    ...(input.tokensPerMinuteForIndicator !== undefined
      ? { tokensPerMinuteForIndicator: numberValue(input.tokensPerMinuteForIndicator) }
      : {}),
  };
}

export function normalizeProjection(value: unknown): Projection {
  const input = asRecord(value);
  return {
    ...input,
    totalCost: numberValue(input.totalCost),
    ...(input.totalTokens !== undefined ? { totalTokens: numberValue(input.totalTokens) } : {}),
    ...(input.remainingMinutes !== undefined
      ? { remainingMinutes: numberValue(input.remainingMinutes) }
      : {}),
  };
}

function normalizeTokenLimitStatus(value: unknown): TokenLimitStatus | null {
  if (value === null || value === undefined) return null;
  const input = asRecord(value);
  return {
    ...input,
    limit:
      input.limit === null || input.limit === undefined || input.limit === "max"
        ? null
        : numberValue(input.limit),
    percentUsed: numberValue(input.percentUsed),
    projectedUsage: numberValue(input.projectedUsage),
    status: input.status === null || input.status === undefined ? null : stringValue(input.status),
  };
}
