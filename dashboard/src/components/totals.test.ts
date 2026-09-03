import { describe, expect, it } from "vitest";
import type { ProviderSummary, Report, UsageRow } from "../api";
import {
  aggregateByProvider,
  aggregateModels,
  budgetOutlook,
  estimateCacheSavings,
  inputPriceForModel,
  modelName,
  modelRowsFor,
  monthProjection,
  totalsFrom,
} from "./totals";

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

describe("estimateCacheSavings", () => {
  it("prices cached reads at ~10% of the model's input rate", () => {
    const report = {
      daily: [
        row({
          totalTokens: 2_000_000,
          modelBreakdowns: [
            { modelName: "claude-opus-4-1", cacheReadTokens: 1_000_000 },
            { modelName: "claude-sonnet-5", cacheReadTokens: 2_000_000 },
          ],
        }),
        row({
          totalTokens: 500_000,
          modelBreakdowns: [{ modelName: "claude-sonnet-5", cacheReadTokens: 500_000 }],
        }),
      ],
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
    } as unknown as Report;
    // 1M opus × $15/M + 2.5M sonnet × $3/M, each discounted 90%.
    expect(estimateCacheSavings(report).saved).toBeCloseTo((15 * 1 + 3 * 2.5) * 0.9, 6);
    expect(estimateCacheSavings(report).cacheReadTokens).toBe(3_500_000);
  });

  it("reports cache share of the token total", () => {
    const report = {
      daily: [
        row({
          totalCost: 1,
          totalTokens: 400,
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 300,
          modelBreakdowns: [{ modelName: "m", cacheReadTokens: 300 }],
        }),
      ],
      weekly: [],
      monthly: [],
      session: [],
      projects: [],
    } as unknown as Report;
    const savings = estimateCacheSavings(report);
    expect(savings.cacheShare).toBeCloseTo(0.75);
  });

  it("handles empty reports and rows without cached reads", () => {
    expect(estimateCacheSavings(null)).toEqual({ saved: 0, cacheReadTokens: 0, cacheShare: null });
    expect(estimateCacheSavings({ daily: [row({})] } as unknown as Report)).toEqual({
      saved: 0,
      cacheReadTokens: 0,
      cacheShare: null,
    });
  });

  it("maps model families to input prices with a sonnet-class default", () => {
    expect(inputPriceForModel("claude-opus-4")).toBe(15);
    expect(inputPriceForModel("claude-haiku-4-5")).toBe(0.8);
    expect(inputPriceForModel("gpt-5-codex")).toBe(1.25);
    expect(inputPriceForModel("gemini-3-pro")).toBe(1.25);
    expect(inputPriceForModel("totally-unknown-model")).toBe(3);
  });
});

describe("monthProjection", () => {
  const report = {
    daily: [],
    weekly: [],
    monthly: [row({ period: "2026-08", totalCost: 120 })],
    session: [],
    projects: [],
  } as unknown as Report;

  it("extrapolates month-to-date over the whole month at the current pace", () => {
    // 120 booked over the first 12 days of a 31-day August.
    const projection = monthProjection(report, "2026-08-12");
    expect(projection.monthToDate).toBe(120);
    expect(projection.dayOfMonth).toBe(12);
    expect(projection.daysInMonth).toBe(31);
    expect(projection.projected).toBeCloseTo(310);
  });

  it("knows how long February is", () => {
    expect(monthProjection(report, "2028-02-10").daysInMonth).toBe(29);
    expect(monthProjection(report, "2027-02-10").daysInMonth).toBe(28);
  });

  it("projects nothing without a report or a dated today", () => {
    expect(monthProjection(null, "2026-08-12").projected).toBe(0);
    expect(monthProjection(report, "").projected).toBe(0);
  });
});

describe("budgetOutlook", () => {
  it("turns amber at the configured threshold and red past the budget", () => {
    expect(budgetOutlook(200, 1000)?.level).toBe("ok");
    expect(budgetOutlook(800, 1000)?.level).toBe("warn");
    expect(budgetOutlook(1001, 1000)?.level).toBe("over");
  });

  it("honors a threshold other than the 0.8 default", () => {
    expect(budgetOutlook(650, 1000, 0.6)?.level).toBe("warn");
    expect(budgetOutlook(650, 1000, 0.9)?.level).toBe("ok");
  });

  it("reports the overage only once the pace overshoots", () => {
    expect(budgetOutlook(1250, 1000)?.overage).toBe(250);
    expect(budgetOutlook(900, 1000)?.overage).toBe(0);
  });

  it("says nothing at all when no budget is set", () => {
    expect(budgetOutlook(500, null)).toBeNull();
    expect(budgetOutlook(500, 0)).toBeNull();
    expect(budgetOutlook(500, Number.NaN)).toBeNull();
  });
});
