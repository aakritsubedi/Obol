export type BudgetStatus = "ok" | "warn" | "over";

export interface ModelBreakdown {
  model?: string;
  modelName?: string;
  name?: string;
  totalCost?: number;
  cost?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  agent?: string;
  [key: string]: unknown;
}

export interface ProviderSummary {
  agent: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelBreakdowns?: ModelBreakdown[];
  modelsUsed?: string[];
  [key: string]: unknown;
}

export interface SummaryToday {
  period: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  [key: string]: unknown;
}

export interface BurnRate {
  costPerHour: number;
  tokensPerMinute?: number;
  tokensPerMinuteForIndicator?: number;
  [key: string]: unknown;
}

export interface Projection {
  totalCost: number;
  totalTokens?: number;
  remainingMinutes?: number;
  [key: string]: unknown;
}

export interface BudgetEvaluation {
  status: BudgetStatus;
  dailyRatio: number | null;
  monthlyRatio: number | null;
  reason: string | null;
}

export interface Summary {
  today: SummaryToday;
  agents: ProviderSummary[];
  burnRate: BurnRate;
  projection: Projection;
  budgetStatus: BudgetStatus;
  budget: BudgetEvaluation;
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
}
