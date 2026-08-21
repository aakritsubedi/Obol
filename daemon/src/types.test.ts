import { describe, expect, it } from "vitest";
import { normalizeBlocks, normalizeReport } from "./types.js";

describe("normalizeReport", () => {
  it("rejects rows without a period or finite total cost", () => {
    expect(() => normalizeReport({ daily: [{ totalCost: 1 }] })).toThrow("missing period");
    expect(() => normalizeReport({ daily: [{ period: "2026-01-01", totalCost: "nope" }] })).toThrow(
      "numeric totalCost",
    );
  });

  it("normalizes number and numeric-string values and sorts rows ascending", () => {
    const report = normalizeReport({
      daily: [
        { period: "2026-01-03", totalCost: "3.5", totalTokens: "7" },
        { period: "2026-01-01", totalCost: 1, inputTokens: "2" },
      ],
    });
    expect(report.daily.map((row) => row.period)).toEqual(["2026-01-01", "2026-01-03"]);
    expect(report.daily[0].inputTokens).toBe(2);
    expect(report.daily[1].totalCost).toBe(3.5);
    expect(report.daily[1].totalTokens).toBe(7);
  });
});

describe("normalizeBlocks", () => {
  it("prefers an active non-gap block over an earlier gap or inactive block", () => {
    const result = normalizeBlocks({
      blocks: [
        { id: "gap", isGap: true, burnRate: { costPerHour: 1 }, projection: { totalCost: 1 } },
        { id: "inactive", burnRate: { costPerHour: 2 }, projection: { totalCost: 2 } },
        { id: "active", isActive: true, burnRate: { costPerHour: "3" }, projection: { totalCost: "4" } },
      ],
    });
    expect(result.burnRate.costPerHour).toBe(3);
    expect(result.projection.totalCost).toBe(4);
  });

  it('normalizes tokenLimitStatus.limit === "max" to null', () => {
    const result = normalizeBlocks({
      blocks: [{ tokenLimitStatus: { limit: "max", percentUsed: "20", projectedUsage: 30 } }],
    });
    expect(result.tokenLimitStatus).toMatchObject({ limit: null, percentUsed: 20, projectedUsage: 30 });
  });

  it("throws when blocks is missing", () => {
    expect(() => normalizeBlocks({})).toThrow("blocks array");
  });
});
