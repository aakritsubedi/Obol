import { describe, expect, it } from "vitest";
import type { CcusageReport } from "../data/ccusage/types.js";
import { type LocalUsageRow, mergeLocalUsage } from "./usage-merge.js";

const local = (overrides: Partial<LocalUsageRow> = {}): LocalUsageRow => ({
  date: "2026-08-25",
  agent: "copilot",
  model: "gpt-5-mini",
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 5,
  cacheCreationTokens: 0,
  totalTokens: 125,
  totalCost: 1.25,
  billing: "subscription",
  ...overrides,
});

const row = (period: string, totalCost = 2, totalTokens = 20) => ({
  period,
  agents: [],
  modelBreakdowns: [],
  modelsUsed: [],
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalCost,
  totalTokens,
  metadata: {},
});

const report = (): CcusageReport => ({
  daily: [row("2026-08-25")],
  weekly: [],
  monthly: [],
  session: [],
  projects: [],
  totals: {},
});

describe("mergeLocalUsage", () => {
  it("adds local usage to an existing date and creates the matching aggregate rows", () => {
    const result = mergeLocalUsage(report(), [local()]);
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0]).toMatchObject({
      period: "2026-08-25",
      totalCost: 3.25,
      totalTokens: 145,
      inputTokens: 100,
      outputTokens: 20,
    });
    expect(result.daily[0].agents[0]).toMatchObject({
      agent: "copilot",
      billing: "subscription",
      totalCost: 1.25,
      totalTokens: 125,
    });
    expect(result.daily[0].modelBreakdowns[0]).toMatchObject({ model: "gpt-5-mini", agent: "copilot" });
    expect(result.weekly[0].period).toBe("2026-08-24");
    expect(result.monthly[0].period).toBe("2026-08");
    expect(result.totals).toMatchObject({ totalCost: 1.25, totalTokens: 125 });
  });

  it("creates a new daily row when ccusage has no row for the date", () => {
    const base = { ...report(), daily: [] };
    const result = mergeLocalUsage(base, [local({ date: "2026-08-26" })]);
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0]).toMatchObject({ period: "2026-08-26", totalCost: 1.25, totalTokens: 125 });
  });
});
