export type BudgetStatus = "ok" | "warn" | "over";

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

export interface ModelBreakdown {
  model?: string;
  modelName?: string;
  name?: string;
  totalCost?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  [key: string]: unknown;
}

export interface Summary {
  today: {
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
  };
  agents: ProviderSummary[];
  burnRate: {
    costPerHour: number;
    tokensPerMinute?: number;
    tokensPerMinuteForIndicator?: number;
    [key: string]: unknown;
  };
  projection: { totalCost: number; totalTokens?: number; remainingMinutes?: number; [key: string]: unknown };
  budgetStatus: BudgetStatus;
  budget: {
    dailyRatio: number | null;
    monthlyRatio: number | null;
    reason: string | null;
  };
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
}

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

export interface WidgetConfig {
  port: number;
  refreshIntervalMs: number;
  dailyBudget: number | null;
  monthlyBudget: number | null;
  warningThreshold: number;
  launchAtLogin: boolean;
  historyDays: number;
}

function token(): string {
  return new URLSearchParams(window.location.search).get("t") || localStorage.getItem("obol-token") || "";
}

export function rememberToken(): void {
  const value = new URLSearchParams(window.location.search).get("t");
  if (value) localStorage.setItem("obol-token", value);
}

function endpoint(path: string): string {
  const value = token();
  if (!value) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("t", value);
  return `${url.pathname}${url.search}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      message = ((await response.json()) as { error?: string }).error || message;
    } catch {
      /* keep status */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const getSummary = () => request<Summary>("/api/summary");
export const getReport = () => request<Report>("/api/report");
export const getConfig = () => request<WidgetConfig>("/api/config");
export const refresh = () => request<Summary>("/api/refresh", { method: "POST" });
export const updateConfig = (patch: Partial<WidgetConfig>) =>
  request<WidgetConfig>("/api/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });

export function subscribe(onSummary: (summary: Summary) => void, onError: () => void): () => void {
  const source = new EventSource(endpoint("/api/events"));
  source.addEventListener("summary", (event) => {
    try {
      onSummary(JSON.parse((event as MessageEvent).data) as Summary);
    } catch {
      onError();
    }
  });
  source.onerror = onError;
  return () => source.close();
}
