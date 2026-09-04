import type { ProviderSummary, Report, UsageRow } from "@shared/api";
import { describe, expect, it } from "vitest";
import { budgetOutlook, estimateCacheSavings, inputPriceForModel, monthProjection } from "./spend";

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

function provider(agent: string, cost: number, tokens: number): ProviderSummary {
  return {
    agent,
    totalCost: cost,
    totalTokens: tokens,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    modelBreakdowns: [],
  };
}

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

  it("carries the month's real tokens and per-provider cost alongside the guess", () => {
    const detailed = {
      daily: [],
      weekly: [],
      monthly: [
        row({
          period: "2026-08",
          totalCost: 120,
          totalTokens: 4_000,
          inputTokens: 900,
          outputTokens: 600,
          cacheCreationTokens: 500,
          cacheReadTokens: 2_000,
          agents: [provider("codex", 20, 1_000), provider("claude", 100, 3_000)],
        }),
      ],
      session: [],
      projects: [],
    } as unknown as Report;

    const projection = monthProjection(detailed, "2026-08-12");
    expect(projection.actual).toEqual({
      inputTokens: 900,
      outputTokens: 600,
      cacheCreationTokens: 500,
      cacheReadTokens: 2_000,
      totalCost: 120,
      totalTokens: 4_000,
    });
    // Dearest first, so the breakdown reads in the order it matters.
    expect(projection.providers).toEqual([
      { agent: "claude", totalCost: 100, totalTokens: 3_000 },
      { agent: "codex", totalCost: 20, totalTokens: 1_000 },
    ]);
  });

  it("reports zeroed actuals and no providers before the month has a row", () => {
    const projection = monthProjection(report, "2026-09-04");
    expect(projection.monthToDate).toBe(0);
    expect(projection.actual.totalTokens).toBe(0);
    expect(projection.providers).toEqual([]);
  });

  it("drops providers that booked nothing this month", () => {
    const detailed = {
      daily: [],
      weekly: [],
      monthly: [
        row({
          period: "2026-08",
          totalCost: 50,
          agents: [provider("claude", 50, 1_000), provider("gemini", 0, 0)],
        }),
      ],
      session: [],
      projects: [],
    } as unknown as Report;
    expect(monthProjection(detailed, "2026-08-12").providers.map((entry) => entry.agent)).toEqual(["claude"]);
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
