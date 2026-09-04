import type { BurnRate, ModelBreakdown, Projection, ProviderSummary } from "./summary.js";

export interface UsageRow {
  period: string;
  agent?: string;
  agents: ProviderSummary[];
  modelBreakdowns: ModelBreakdown[];
  modelsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  totalTokens: number;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProjectUsageRow extends UsageRow {
  project: string;
}

export interface ReportTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  totalTokens: number;
}

export interface Report {
  daily: UsageRow[];
  weekly: UsageRow[];
  monthly: UsageRow[];
  session: UsageRow[];
  projects: ProjectUsageRow[];
  totals?: ReportTotals;
  [key: string]: unknown;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  [key: string]: unknown;
}

export interface TokenLimitStatus {
  limit: number | null;
  percentUsed: number;
  projectedUsage: number;
  status: string | null;
  [key: string]: unknown;
}

export interface UsageBlock {
  id: string;
  startTime: string;
  endTime: string;
  actualEndTime: string | null;
  isActive: boolean;
  isGap: boolean;
  entries: number;
  models: string[];
  costUSD: number;
  totalTokens: number;
  burnRate: BurnRate;
  projection: Projection;
  tokenCounts: TokenCounts;
  tokenLimitStatus: TokenLimitStatus | null;
  [key: string]: unknown;
}

export interface BlocksReport {
  blocks: UsageBlock[];
  burnRate: BurnRate;
  projection: Projection;
  tokenLimitStatus: TokenLimitStatus | null;
  raw: Record<string, unknown>;
}
