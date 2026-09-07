import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfig } from "./data/config-store.js";

describe("parseConfig", () => {
  it("falls back to safe defaults for invalid values", () => {
    expect(
      parseConfig({
        port: -1,
        refreshIntervalMs: 1,
        dailyBudget: -4,
        warningThreshold: 4,
        historyDays: 2,
        journalIdleMinutes: 0,
        currency: "not-a-code",
      }),
    ).toEqual(DEFAULT_CONFIG);
  });

  it("normalizes valid values and keeps nullable budgets", () => {
    expect(
      parseConfig({
        port: "8080",
        refreshIntervalMs: "120000",
        refreshFloorMs: "30000",
        dailyBudget: "12.5",
        monthlyBudget: null,
        warningThreshold: 0.9,
        launchAtLogin: 1,
        keepAwake: true,
        keepAwakeWithLidClosed: true,
        historyDays: 30,
        journalIdleMinutes: 20,
        currency: " npr ",
        currencyRate: "152.75",
      }),
    ).toMatchObject({
      port: 8080,
      refreshIntervalMs: 120000,
      refreshFloorMs: 30000,
      dailyBudget: 12.5,
      monthlyBudget: null,
      warningThreshold: 0.9,
      launchAtLogin: true,
      keepAwake: true,
      keepAwakeWithLidClosed: true,
      historyDays: 30,
      journalIdleMinutes: 20,
      currency: "NPR",
      currencyRate: 152.75,
    });
  });

  it("drops an invalid shared exchange rate without changing the currency", () => {
    expect(parseConfig({ currency: "NPR", currencyRate: -1 })).toMatchObject({
      currency: "NPR",
      currencyRate: null,
    });
  });

  it("keeps the refresh floor within the configured upper bound", () => {
    expect(parseConfig({ refreshFloorMs: -1 }).refreshFloorMs).toBe(0);
    expect(parseConfig({ refreshFloorMs: 601_000 }).refreshFloorMs).toBe(600_000);
    expect(parseConfig({ refreshFloorMs: 0 }).refreshFloorMs).toBe(0);
  });

  it("keeps the refresh interval at least 30 seconds and on a 5-second boundary", () => {
    expect(parseConfig({ refreshIntervalMs: 30_000 }).refreshIntervalMs).toBe(30_000);
    expect(parseConfig({ refreshIntervalMs: 32_000 }).refreshIntervalMs).toBe(35_000);
    expect(parseConfig({ refreshIntervalMs: 37_500 }).refreshIntervalMs).toBe(40_000);
  });
});
