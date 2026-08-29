import { describe, expect, it } from "vitest";
import { buildSummary } from "./cache.js";
import type { WidgetConfig } from "./types.js";
import { emptyBlocks, normalizeReport } from "./types.js";

const config: WidgetConfig = {
  port: 4737,
  refreshIntervalMs: 300_000,
  dailyBudget: null,
  monthlyBudget: null,
  warningThreshold: 0.8,
  launchAtLogin: false,
  keepAwake: false,
  historyDays: 90,
  journalIdleMinutes: 15,
  currency: "USD",
};

function todayKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

describe("buildSummary", () => {
  it.each(["2026-01-01", "20260101", "2026-01-01T00:00:00.000Z"])(
    "recognizes today period format %s",
    (period) => {
      const formattedPeriod =
        period === "20260101" ? todayKey().replace(/-/g, "") : period.replace("2026-01-01", todayKey());
      const report = normalizeReport({ daily: [{ period: formattedPeriod, totalCost: 2 }] });
      expect(buildSummary(report, emptyBlocks(), config, null, false, null).today.totalCost).toBe(2);
    },
  );

  it("uses an empty today fallback when no row matches", () => {
    const summary = buildSummary(
      normalizeReport({ daily: [{ period: "1900-01-01", totalCost: 2 }] }),
      emptyBlocks(),
      config,
      null,
      true,
      null,
    );
    expect(summary.today.totalCost).toBe(0);
    expect(summary.today.period).toBe(todayKey());
  });

  it("uses the agent, name, provider, then provider-N fallback chain", () => {
    const report = normalizeReport({
      daily: [
        {
          period: todayKey(),
          totalCost: 4,
          agents: [
            { agent: "claude", totalCost: 1 },
            { name: "codex", totalCost: 1 },
            { provider: "cursor", totalCost: 1 },
            { totalCost: 1 },
          ],
        },
      ],
    });
    expect(
      buildSummary(report, emptyBlocks(), config, null, false, null).agents.map((agent) => agent.agent),
    ).toEqual(["claude", "codex", "cursor", "provider-4"]);
  });
});
