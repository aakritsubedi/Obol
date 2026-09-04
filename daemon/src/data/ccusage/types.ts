/** Raw, vendor-facing shapes used before the daemon's normalization boundary. */
export interface CcusageRow {
  period: string;
  agent?: string;
  agents: Array<Record<string, unknown>>;
  modelBreakdowns: Array<Record<string, unknown>>;
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

export interface ProjectUsageRow extends CcusageRow {
  project: string;
}

export interface CcusageReport {
  daily: CcusageRow[];
  weekly: CcusageRow[];
  monthly: CcusageRow[];
  session: CcusageRow[];
  projects: ProjectUsageRow[];
  totals: Record<string, unknown>;
  [key: string]: unknown;
}
