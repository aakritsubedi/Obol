import { describe, expect, it } from "vitest";
import type { UsageRow } from "../api";
import { buildContributionCalendar, trimFutureContribution } from "./contribution";

function row(period: string, totalCost = 0, totalTokens = 0): UsageRow {
  return {
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
  };
}

function dayByKey(calendar: ReturnType<typeof buildContributionCalendar>, key: string) {
  const day = calendar.days.find((entry) => entry.key === key);
  expect(day).toBeDefined();
  return day!;
}

describe("buildContributionCalendar", () => {
  it("creates aligned Sunday weeks covering the whole local year", () => {
    const calendar = buildContributionCalendar([], new Date(2025, 1, 15));
    expect(calendar.year).toBe(2025);
    expect(calendar.days).toHaveLength(365);
    expect(dayByKey(calendar, "2025-01-01").date.getDay()).toBe(3);
    expect(calendar.weeks[0].days.filter(Boolean)).toHaveLength(4);
    expect(calendar.weeks.at(-1)?.days.filter(Boolean)).toHaveLength(4);
    expect(calendar.monthLabels.map((label) => label.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
  });

  it("aggregates duplicate daily rows and colors active days by token quartiles", () => {
    const now = new Date(2026, 7, 23, 12);
    const rows = [
      row("2026-08-16", 2, 100),
      row("2026-08-16", 1, 20),
      row("2026-08-17", 1, 200),
      row("2026-08-18", 1, 300),
      row("2026-08-19", 1, 400),
      row("2025-12-31", 50, 9_000),
    ];
    const calendar = buildContributionCalendar(rows, now);

    const sunday = dayByKey(calendar, "2026-08-16");
    expect(sunday.tokens).toBe(120);
    expect(sunday.cost).toBe(3);
    expect(sunday.state).toBe("level-1");
    expect(sunday.level).toBe(1);
    expect(sunday.tooltip).toEqual(["Sun, Aug 16, 2026", "120 tokens burned", "$3.00 total cost"]);
    expect(dayByKey(calendar, "2026-08-19").level).toBe(4);
  });

  it("dims dates before the first recorded activity and explains that in the tooltip", () => {
    const now = new Date(2026, 7, 23);
    const calendar = buildContributionCalendar([row("2026-03-05", 1, 10)], now);
    const before = dayByKey(calendar, "2026-02-01");
    expect(before.state).toBe("before-data");
    expect(before.level).toBe(0);
    expect(before.tooltip[1]).toBe("No data before Mar 5");
    expect(dayByKey(calendar, "2026-04-01").state).toBe("empty");
  });

  it("marks dates after today as future and keeps today eligible for activity", () => {
    const now = new Date(2026, 7, 23, 18);
    const calendar = buildContributionCalendar([row("2026-08-22", 1, 10)], now);
    expect(dayByKey(calendar, "2026-08-23").state).toBe("empty");
    expect(dayByKey(calendar, "2026-08-24").tooltip[1]).toBe("Future date");
    expect(dayByKey(calendar, "2026-08-22").state).toBe("level-4");
  });

  it("trims future cells and month labels for static exports", () => {
    const calendar = buildContributionCalendar([], new Date(2026, 7, 23, 12));
    const visible = trimFutureContribution(calendar);
    const lastWeek = visible.weeks.at(-1);

    expect(lastWeek?.days.some((day) => day?.key === "2026-08-24")).toBe(false);
    expect(visible.weeks.length).toBeLessThan(calendar.weeks.length);
    expect(visible.monthLabels.at(-1)?.label).toBe("Aug");
  });
});
