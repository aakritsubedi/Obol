import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { evaluateBudget } from "./budget.js";
import {
  asRecord,
  emptyBlocks,
  emptyReport,
  normalizeBlocks,
  normalizeReport,
  numberValue,
  stringValue,
  type BlocksReport,
  type CcusageReport,
  type ProviderSummary,
  type Snapshot,
  type Summary,
  type SummaryToday,
  type WidgetConfig
} from "./types.js";

function dateForTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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
    modelBreakdowns: []
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
      cacheReadTokens: numberValue(agent.cacheReadTokens)
    };
  });
}

export function buildSummary(
  report: CcusageReport,
  blocks: BlocksReport,
  config: WidgetConfig,
  updatedAt: string | null,
  stale: boolean,
  error: string | null
): Summary {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const todayKey = dateForTimeZone(new Date(), timezone);
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
      modelBreakdowns: Array.isArray(today.modelBreakdowns) ? today.modelBreakdowns : []
    },
    agents: providerSummaries(today),
    burnRate: blocks.burnRate,
    projection: blocks.projection,
    budgetStatus: budget.status,
    budget,
    updatedAt,
    stale,
    error
  };
}

function emptySnapshot(config: WidgetConfig): Snapshot {
  const report = emptyReport();
  const blocks = emptyBlocks();
  return {
    report,
    blocks,
    summary: buildSummary(report, blocks, config, null, true, "No usage snapshot yet"),
    updatedAt: null,
    refreshedAt: null,
    error: "No usage snapshot yet"
  };
}

export class SnapshotStore {
  private snapshot: Snapshot;
  private readonly path: string;

  constructor(path: string, config: WidgetConfig) {
    this.path = path;
    this.snapshot = emptySnapshot(config);
  }

  async load(config: WidgetConfig): Promise<Snapshot> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Record<string, unknown>;
      const report = normalizeReport(parsed.report);
      const blocks = normalizeBlocks(parsed.blocks);
      const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
      const refreshedAt = typeof parsed.refreshedAt === "string" ? parsed.refreshedAt : updatedAt;
      const error = typeof parsed.error === "string" ? parsed.error : null;
      this.snapshot = {
        report,
        blocks,
        summary: buildSummary(report, blocks, config, updatedAt, Boolean(error), error),
        updatedAt,
        refreshedAt,
        error
      };
    } catch {
      this.snapshot = emptySnapshot(config);
    }
    return this.get();
  }

  get(): Snapshot {
    return this.snapshot;
  }

  async apply(
    report: CcusageReport,
    blocks: BlocksReport,
    config: WidgetConfig,
    error: string | null = null
  ): Promise<Snapshot> {
    const now = new Date().toISOString();
    this.snapshot = {
      report,
      blocks,
      summary: buildSummary(report, blocks, config, now, Boolean(error), error),
      updatedAt: now,
      refreshedAt: now,
      error
    };
    await this.save();
    return this.get();
  }

  async markError(config: WidgetConfig, error: string): Promise<Snapshot> {
    const current = this.snapshot;
    this.snapshot = {
      ...current,
      summary: buildSummary(current.report, current.blocks, config, current.updatedAt, true, error),
      error
    };
    await this.save();
    return this.get();
  }

  async reconfigure(config: WidgetConfig): Promise<Snapshot> {
    this.snapshot = {
      ...this.snapshot,
      summary: buildSummary(
        this.snapshot.report,
        this.snapshot.blocks,
        config,
        this.snapshot.updatedAt,
        Boolean(this.snapshot.error),
        this.snapshot.error
      )
    };
    await this.save();
    return this.get();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.snapshot, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.path);
  }
}
