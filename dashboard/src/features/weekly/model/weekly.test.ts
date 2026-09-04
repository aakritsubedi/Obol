import type { ProjectUsageRow, UsageRow } from "@shared/api";
import { describe, expect, it } from "vitest";
import {
  aggregateModels,
  aggregateProjects,
  aggregateProviders,
  deltaKind,
  formatWeekRange,
  inWeek,
  leaderRows,
  previousWeek,
  type WeekRange,
  weekRange,
  weekToDateRanges,
} from "./weekly";

const usage = (cost: number, tokens: number) => ({
  cost,
  tokens,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
});

function row(overrides: Partial<UsageRow>): UsageRow {
  return {
    period: "2026-08-19",
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

describe("weekRange", () => {
  it("returns the Sunday–Saturday window containing the date", () => {
    // Wednesday, August 19 2026.
    expect(weekRange(new Date(2026, 7, 19))).toEqual({ start: "2026-08-16", end: "2026-08-22" });
  });

  it("treats Sunday as the first day of the week", () => {
    expect(weekRange(new Date(2026, 7, 23))).toEqual({ start: "2026-08-23", end: "2026-08-29" });
    expect(weekRange(new Date(2026, 7, 22))).toEqual({ start: "2026-08-16", end: "2026-08-22" });
  });

  it("shifts back exactly seven days for the previous week", () => {
    const current = weekRange(new Date(2026, 7, 19));
    expect(previousWeek(current)).toEqual({ start: "2026-08-09", end: "2026-08-15" });
  });

  it("clips both windows to the same elapsed weekdays for fair comparison", () => {
    // Wednesday Aug 19 → day index 3; previous window is Sun–Wed last week.
    const ranges = weekToDateRanges(new Date(2026, 7, 19));
    expect(ranges.dayIndex).toBe(3);
    expect(ranges.current).toEqual({ start: "2026-08-16", end: "2026-08-19" });
    expect(ranges.previous).toEqual({ start: "2026-08-09", end: "2026-08-12" });
  });

  it("never compares against the future on a Sunday", () => {
    const ranges = weekToDateRanges(new Date(2026, 7, 23));
    expect(ranges.dayIndex).toBe(0);
    expect(ranges.current).toEqual({ start: "2026-08-23", end: "2026-08-23" });
    expect(ranges.previous).toEqual({ start: "2026-08-16", end: "2026-08-16" });
  });

  it("formats the range for display", () => {
    expect(formatWeekRange({ start: "2026-08-16", end: "2026-08-22" }, "en-US")).toBe("Aug 16 – Aug 22");
  });

  it("checks membership with string comparison on the date key", () => {
    const range: WeekRange = { start: "2026-08-16", end: "2026-08-22" };
    expect(inWeek("2026-08-16", range)).toBe(true);
    expect(inWeek("2026-08-22T12:00:00Z", range)).toBe(true);
    expect(inWeek("2026-08-23", range)).toBe(false);
    expect(inWeek("2026-08", range)).toBe(false);
  });
});

describe("aggregateModels", () => {
  it("sums model usage across days inside the week only", () => {
    const rows = [
      row({
        period: "2026-08-17",
        modelBreakdowns: [{ modelName: "claude-opus-5", totalCost: 2, totalTokens: 100 }],
      }),
      row({
        period: "2026-08-18",
        modelBreakdowns: [
          { modelName: "claude-opus-5", cost: 3 },
          { modelName: "claude-haiku-5", totalCost: 1, totalTokens: 40 },
        ],
      }),
      row({
        period: "2026-08-10",
        modelBreakdowns: [{ modelName: "claude-opus-5", totalCost: 99, totalTokens: 999 }],
      }),
    ];
    const grouped = aggregateModels(rows, { start: "2026-08-16", end: "2026-08-22" });
    expect(grouped.get("claude-opus-5")).toEqual(usage(5, 100));
    expect(grouped.get("claude-haiku-5")).toEqual(usage(1, 40));
    expect(grouped.size).toBe(2);
  });

  it("keeps token classes separate so totals can be reconciled", () => {
    const rows = [
      row({
        modelBreakdowns: [
          {
            modelName: "m",
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 300,
            cacheCreationTokens: 2,
            totalCost: 1,
          },
        ],
      }),
    ];
    const grouped = aggregateModels(rows, { start: "2026-08-16", end: "2026-08-22" });
    const totals = grouped.get("m");
    expect(totals?.tokens).toBe(317);
    expect(totals?.inputTokens).toBe(10);
    expect(totals?.outputTokens).toBe(5);
    expect(totals?.cacheReadTokens).toBe(300);
  });

  it("falls back to token components when totals are missing", () => {
    const rows = [
      row({
        modelBreakdowns: [
          { modelName: "m", inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheCreationTokens: 2 },
        ],
      }),
    ];
    expect(aggregateModels(rows, { start: "2026-08-16", end: "2026-08-22" }).get("m")?.tokens).toBe(20);
  });
});

describe("aggregateProviders", () => {
  it("merges per-agent daily totals by provider name", () => {
    const agent = (name: string, cost: number, tokens: number) => ({
      agent: name,
      totalCost: cost,
      totalTokens: tokens,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    const rows = [
      row({ agents: [agent("claude", 4, 50)] }),
      row({
        period: "2026-08-18",
        agents: [agent("codex", 1, 10), agent("claude", 1.5, 25)],
      }),
      row({
        period: "2026-07-01",
        agents: [agent("claude", 500, 5000)],
      }),
    ];
    const grouped = aggregateProviders(rows, { start: "2026-08-16", end: "2026-08-22" });
    expect(grouped.get("claude")).toEqual(usage(5.5, 75));
    expect(grouped.get("codex")).toEqual(usage(1, 10));
  });
});

describe("aggregateProjects", () => {
  it("groups project rows by display label within the week", () => {
    const projects = [
      { ...row({ period: "2026-08-17", totalCost: 2, totalTokens: 30 }), project: "-Users-dev-token-widget" },
      { ...row({ period: "2026-08-19", totalCost: 1, totalTokens: 12 }), project: "-Users-dev-token-widget" },
      { ...row({ period: "2026-01-01", totalCost: 9, totalTokens: 90 }), project: "-Users-dev-old" },
    ] as ProjectUsageRow[];
    const grouped = aggregateProjects(projects, { start: "2026-08-16", end: "2026-08-22" });
    expect(grouped.size).toBe(1);
    expect(grouped.get("widget")).toEqual(usage(3, 42));
  });
});

describe("deltaKind", () => {
  it("names the ordinary directions", () => {
    expect(deltaKind(0.154)).toBe("up");
    expect(deltaKind(-0.08)).toBe("down");
    expect(deltaKind(0)).toBe("unchanged");
  });

  it("separates a first week from a baseline too small to divide by", () => {
    expect(deltaKind(null)).toBe("first-week");
    // +3,041% against NPR 63 last week: arithmetically true, informationally empty.
    expect(deltaKind(30.411)).toBe("negligible");
    expect(deltaKind(16.799)).toBe("negligible");
    expect(deltaKind(9.5)).toBe("up");
  });

  it("never calls a fall negligible, however steep", () => {
    expect(deltaKind(-0.999)).toBe("down");
  });
});

describe("leaderRows", () => {
  const current = new Map([
    ["a", usage(10, 200)],
    ["b", usage(20, 100)],
    ["c", usage(1, 300)],
  ]);
  const last = new Map([
    ["a", usage(5, 400)],
    ["b", usage(0, 100)],
  ]);

  it("ranks by the chosen metric and computes deltas against last week", () => {
    const rows = leaderRows(current, last, "cost");
    expect(rows.map((entry) => entry.name)).toEqual(["b", "a", "c"]);
    expect(rows[0]).toEqual({
      name: "b",
      cost: 20,
      tokens: 100,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      costDelta: 20,
      costRatio: null,
      costBaseline: 0,
      tokenDelta: 0,
      tokenRatio: 0,
      tokenBaseline: 100,
    });
    expect(rows[1].costRatio).toBe(1);
    expect(rows[1].tokenRatio).toBe(-0.5);
  });

  it("ranks by tokens when requested", () => {
    expect(leaderRows(current, last, "tokens").map((entry) => entry.name)).toEqual(["c", "a", "b"]);
  });

  it("reports a baseline alongside every ratio", () => {
    const rows = leaderRows(current, last, "cost");
    expect(rows.find((entry) => entry.name === "a")?.costBaseline).toBe(5);
    expect(rows.find((entry) => entry.name === "c")?.costBaseline).toBe(0);
  });

  it("drops entries that were inactive this week and ties break alphabetically", () => {
    const grouped = leaderRows(
      new Map([["b", usage(2, 2)]]),
      new Map([
        ["gone", usage(9, 9)],
        ["zeta", usage(4, 4)],
      ]),
      "cost",
    );
    expect(grouped.map((entry) => entry.name)).toEqual(["b"]);
  });
});
