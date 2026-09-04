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
});
