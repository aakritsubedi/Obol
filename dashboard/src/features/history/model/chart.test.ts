import type { ProjectUsageRow, UsageRow } from "@shared/api";
import { describe, expect, it } from "vitest";
import { chartPoints, labelIndexes, niceScale } from "./chart";

function row(overrides: Partial<UsageRow>): UsageRow {
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

describe("history chart model", () => {
  it("rounds a maximum to a readable four-step scale", () => {
    expect(niceScale(17)).toEqual({ step: 5, max: 20 });
    expect(niceScale(0)).toEqual({ step: 1, max: 1 });
  });

  it("keeps the first and last period labels visible", () => {
    const indexes = labelIndexes(10);
    expect(indexes.has(0)).toBe(true);
    expect(indexes.has(9)).toBe(true);
  });

  it("builds provider groups using the selected metric", () => {
    const points = chartPoints(
      [
        row({
          agents: [
            {
              agent: "claude",
              totalCost: 3,
              totalTokens: 300,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
            },
            {
              agent: "codex",
              totalCost: 1,
              totalTokens: 500,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
            },
          ],
        }),
      ],
      "tokens",
    );
    expect(points[0].groups.map((group) => group.key)).toEqual(["codex", "claude"]);
    expect(points[0].groups[0].value).toBe(500);
  });

  it("aggregates project rows and retains their cost and token totals", () => {
    const points = chartPoints(
      [
        { ...row({ totalCost: 2, totalTokens: 20 }), project: "-Users-dev-widget" },
        { ...row({ totalCost: 1, totalTokens: 10 }), project: "-Users-dev-widget" },
      ] as ProjectUsageRow[],
      "cost",
      "project",
    );
    expect(points).toHaveLength(1);
    expect(points[0].groups).toEqual([{ key: "Widget", label: "Widget", value: 3, cost: 3, tokens: 30 }]);
  });
});
