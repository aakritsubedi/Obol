import { describe, expect, it } from "vitest";
import type { PricingTable } from "../domain/pricing.js";
import type { CcusageReport } from "./ccusage/types.js";
import { repriceReport } from "./reprice-report.js";

const pricing: PricingTable = {
  entries: [
    {
      id: "gpt-5-mini",
      aliases: ["gpt-5-mini"],
      price: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
    },
  ],
};

function report(): CcusageReport {
  const breakdown = {
    model: "gpt-5-mini",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 2_000_000,
    totalCost: 99,
    cost: 99,
  };
  return {
    daily: [
      {
        period: "2026-08-25",
        agents: [{ agent: "claude", totalCost: 99, modelBreakdowns: [breakdown] }],
        modelBreakdowns: [breakdown],
        modelsUsed: ["gpt-5-mini"],
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalCost: 99,
        totalTokens: 2_000_000,
        metadata: {},
      },
    ],
    weekly: [],
    monthly: [],
    session: [],
    projects: [],
    totals: { totalCost: 99 },
  };
}

describe("repriceReport", () => {
  it("recalculates recognized model breakdowns and aggregate costs", () => {
    const result = repriceReport(report(), pricing);
    expect(result.daily[0]?.totalCost).toBe(3);
    expect(result.daily[0]?.agents[0]?.totalCost).toBe(3);
    expect(result.daily[0]?.modelBreakdowns[0]?.totalCost).toBe(3);
    expect(result.totals.totalCost).toBe(3);
  });

  it("leaves unknown model costs untouched", () => {
    const input = report();
    const breakdown = input.daily[0]?.modelBreakdowns[0];
    if (!breakdown || !input.daily[0]) throw new Error("fixture missing");
    breakdown.model = "future-model";
    input.daily[0].modelsUsed = ["future-model"];

    const result = repriceReport(input, pricing);
    expect(result.daily[0]?.totalCost).toBe(99);
    expect(result.totals.totalCost).toBe(99);
  });
});
