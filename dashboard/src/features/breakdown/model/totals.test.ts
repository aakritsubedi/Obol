import { modelName, totalsFrom } from "@shared/analytics/totals";
import type { ProviderSummary, Report, UsageRow } from "@shared/api";
import { describe, expect, it } from "vitest";
import { aggregateByProvider, aggregateModels, modelRowsFor } from "./totals";

function row(overrides: Partial<UsageRow> & Record<string, unknown>): UsageRow {
  return {
    period: "2026-08-21",
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
    ...overrides,
  };
}

function provider(agent: string, cost: number, tokens: number, breakdowns: unknown[] = []): ProviderSummary {
  return {
    agent,
    totalCost: cost,
    totalTokens: tokens,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    modelBreakdowns: breakdowns as ProviderSummary["modelBreakdowns"],
  };
}

const breakdown = (model: string, cost: number, tokens = 100) => ({
  model,
  totalCost: cost,
  totalTokens: tokens,
  inputTokens: tokens / 2,
  outputTokens: tokens / 2,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
});

describe("modelName", () => {
  it("prefers modelName, then model, then name", () => {
    expect(modelName({ modelName: "a", model: "b", name: "c" })).toBe("a");
    expect(modelName({ model: "b", name: "c" })).toBe("b");
    expect(modelName({ name: "c" })).toBe("c");
    expect(modelName({})).toBe("Unknown model");
  });
});

describe("modelRowsFor", () => {
  it("returns only the latest row of the period", () => {
    const report = {
      daily: [row({ period: "2026-08-20" }), row({ period: "2026-08-21" })],
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
    };
    expect(modelRowsFor(report as Report, "daily")).toHaveLength(1);
    expect(modelRowsFor(report as Report, "daily")[0].period).toBe("2026-08-21");
    expect(modelRowsFor({ ...report, daily: [] } as Report, "daily")).toEqual([]);
  });
});

describe("totalsFrom", () => {
  it("returns zeros for a missing report", () => {
    expect(totalsFrom(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
      totalTokens: 0,
    });
  });

  it("reduces daily rows when no server totals exist", () => {
    const report = {
      daily: [
        row({ totalCost: 2, totalTokens: 10, inputTokens: 4 }),
        row({ totalCost: 3, totalTokens: 20, inputTokens: 6 }),
      ],
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
    } as unknown as Report;
    expect(totalsFrom(report)).toMatchObject({ totalCost: 5, totalTokens: 30, inputTokens: 10 });
  });

  it("prefers finite server totals and falls back per field", () => {
    const base = {
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
      daily: [row({ totalCost: 2, totalTokens: 10 })],
    };
    expect(
      totalsFrom({
        ...base,
        totals: {
          inputTokens: 1,
          outputTokens: 2,
          cacheCreationTokens: 3,
          cacheReadTokens: 4,
          totalCost: 9,
          totalTokens: 11,
        },
      } as unknown as Report),
    ).toMatchObject({ totalCost: 9, totalTokens: 11 });
    expect(
      totalsFrom({
        ...base,
        totals: {
          inputTokens: Number.NaN,
          outputTokens: 2,
          cacheCreationTokens: 3,
          cacheReadTokens: 4,
          totalCost: Number.NaN,
          totalTokens: 11,
        },
      } as unknown as Report),
    ).toMatchObject({ totalCost: 2, totalTokens: 11 });
  });
});

describe("aggregateModels", () => {
  it("merges models across rows and sorts by cost", () => {
    const report = {
      daily: [
        row({ modelBreakdowns: [breakdown("claude-sonnet", 1), breakdown("gpt-5", 3)] }),
        row({ modelBreakdowns: [breakdown("claude-sonnet", 2)] }),
      ],
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
    } as unknown as Report;
    const models = aggregateModels(report);
    expect(models.map((model) => model.model)).toEqual(["claude-sonnet", "gpt-5"]);
    expect(models[0].totalCost).toBe(3);
    expect(models[0].totalTokens).toBe(200);
  });
});

describe("aggregateByProvider", () => {
  it("groups model breakdowns per provider with per-model rollups", () => {
    const report = {
      daily: [
        row({
          agents: [
            provider("claude", 3, 200, [breakdown("claude-sonnet", 1), breakdown("claude-opus", 2)]),
            provider("codex", 4, 100, [breakdown("gpt-5", 4)]),
          ],
        }),
      ],
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
    } as unknown as Report;
    const groups = aggregateByProvider(report);
    expect(groups.map((group) => group.agent)).toEqual(["codex", "claude"]);
    expect(groups[1].models.map((model) => model.model)).toEqual(["claude-opus", "claude-sonnet"]);
    expect(groups[1].totalCost).toBe(3);
  });

  it("skips providers without breakdowns and returns empty when none exist", () => {
    const noBreakdown = {
      daily: [row({ agents: [provider("claude", 5, 1)] })],
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
    } as unknown as Report;
    expect(aggregateByProvider(noBreakdown)).toEqual([]);
  });
});
