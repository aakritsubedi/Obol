export type BudgetStatus = "ok" | "warn" | "over";

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

export interface CcusageReport {
  daily: CcusageRow[];
  weekly: CcusageRow[];
  monthly: CcusageRow[];
  session: CcusageRow[];
  projects: ProjectUsageRow[];
  totals: Record<string, unknown>;
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

export interface ProjectUsageRow extends CcusageRow {
  project: string;
}

export interface ProviderSummary {
  agent: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
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
  modelBreakdowns: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BudgetConfig {
  dailyBudget: number | null;
  monthlyBudget: number | null;
  warningThreshold: number;
}

export interface WidgetConfig extends BudgetConfig {
  port: number;
  refreshIntervalMs: number;
  launchAtLogin: boolean;
  // Menu bar only. While true the app holds a power-management assertion so an
  // agent run is not cut short by the Mac idling into sleep.
  keepAwake: boolean;
  // Menu bar only, and only meaningful alongside keepAwake. Clamshell sleep is
  // the kernel's call rather than an assertion, so the app holds it off with
  // `pmset disablesleep` under a one-time administrator grant.
  keepAwakeWithLidClosed: boolean;
  historyDays: number;
  journalIdleMinutes: number;
  // Display only. Every cost this daemon reports — budgets and alerts included
  // — stays in USD; the menu bar and dashboard convert at the point of render.
  currency: string;
}

export interface JournalSession {
  id: string;
  /** Which agent recorded this session — "claude", "codex", … */
  provider: string;
  title: string | null;
  project: string;
  projectPath: string;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string;
  activeMinutes: number;
  humanPrompts: number;
  assistantTurns: number;
  toolCalls: number;
  filesEdited: string[];
  models: string[];
  // What the person actually asked for, with the editor's injected context
  // stripped out. Capped per session and truncated per line.
  prompts: string[];
  toolMix: Record<string, number>;
  // Output tokens only — the one token figure a transcript records per session,
  // and the weight the cost below is apportioned by. Null when the transcript
  // recorded none, which for a provider that logs no usage at all (Codex) is
  // every session: a count nobody reported is unknown, not zero.
  outputTokens: number | null;
  // Apportioned from the project total by output tokens: ccusage reports cost
  // per project per day, never per session. An estimate, not a measurement.
  totalCost: number | null;
}

// A session with work recorded inside the idle window — one an agent is
// plausibly still driving. Deliberately narrower than JournalSession: the menu
// bar polls this every few seconds and needs none of the prompt or tool detail.
export interface ActiveSession {
  id: string;
  provider: string;
  project: string;
  gitBranch: string | null;
  startedAt: string;
  lastEventAt: string;
  activeMinutes: number;
  outputTokens: number | null;
  totalCost: number | null;
}

export interface JournalProject {
  name: string;
  path: string;
  activeMinutes: number;
  sessions: number;
  filesEdited: number;
  toolCalls: number;
  /** The agents that worked on this project during the day. */
  providers: string[];
  // Only Claude reports spend per project, so this is null for a project no
  // Claude session touched.
  totalCost: number | null;
}

export interface DayJournal {
  date: string;
  timezone: string;
  idleMinutes: number;
  activeMinutes: number;
  blocks: number;
  spanMinutes: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  humanPrompts: number;
  assistantTurns: number;
  toolCalls: number;
  toolMix: Record<string, number>;
  filesEdited: number;
  testRuns: number;
  /** Every agent that recorded work on this day. */
  providers: string[];
  sessions: JournalSession[];
  projects: JournalProject[];
  // Every agent's spend for the day, matching the dashboard's Today card.
  totalCost: number;
  totalTokens: number;
  computedAt: string;
}

export function emptyJournal(date: string, timezone: string, idleMinutes: number): DayJournal {
  return {
    date,
    timezone,
    idleMinutes,
    activeMinutes: 0,
    blocks: 0,
    spanMinutes: 0,
    firstEventAt: null,
    lastEventAt: null,
    humanPrompts: 0,
    assistantTurns: 0,
    toolCalls: 0,
    toolMix: {},
    filesEdited: 0,
    testRuns: 0,
    providers: [],
    sessions: [],
    projects: [],
    totalCost: 0,
    totalTokens: 0,
    computedAt: new Date().toISOString(),
  };
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

export interface Snapshot {
  report: CcusageReport;
  blocks: BlocksReport;
  summary: Summary;
  updatedAt: string | null;
  refreshedAt: string | null;
  error: string | null;
}

export interface RuntimeState {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
  dashboardUrl: string;
}

export interface RefreshResult {
  report: CcusageReport | null;
  fullReport?: CcusageReport | null;
  blocks: BlocksReport | null;
  errors: string[];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function numberValue(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

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
  const blocks = input.blocks.map((value, index) => normalizeBlock(value, index));
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

  return {
    blocks,
    burnRate,
    projection,
    tokenLimitStatus,
    raw: input,
  };
}

function normalizeBlock(value: unknown, index: number): UsageBlock {
  const input = asRecord(value);
  const tokenCounts = asRecord(input.tokenCounts);
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
    tokenCounts: {
      ...tokenCounts,
      inputTokens: numberValue(tokenCounts.inputTokens),
      outputTokens: numberValue(tokenCounts.outputTokens),
      cacheCreationTokens: numberValue(
        tokenCounts.cacheCreationTokens ?? tokenCounts.cacheCreationInputTokens,
      ),
      cacheReadTokens: numberValue(tokenCounts.cacheReadTokens ?? tokenCounts.cacheReadInputTokens),
    },
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

export function emptyReport(): CcusageReport {
  return { daily: [], weekly: [], monthly: [], session: [], projects: [], totals: {} };
}

export function emptyBlocks(): BlocksReport {
  return {
    blocks: [],
    burnRate: { costPerHour: 0 },
    projection: { totalCost: 0 },
    tokenLimitStatus: null,
    raw: {},
  };
}
