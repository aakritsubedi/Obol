import { describe, expect, it } from "vitest";
import { evaluateBudget } from "./budget.js";
import type { BudgetConfig } from "./types.js";

const noBudget: BudgetConfig = {
  dailyBudget: null,
  monthlyBudget: null,
  warningThreshold: 0,
};

describe("evaluateBudget", () => {
  it("stays ok with null ratios when no budgets are configured, even at threshold zero", () => {
    expect(evaluateBudget(100, 100, noBudget)).toEqual({
      status: "ok",
      dailyRatio: null,
      monthlyRatio: null,
      reason: null,
    });
  });

  it("treats zero budgets as unset", () => {
    expect(evaluateBudget(100, 100, { ...noBudget, dailyBudget: 0, monthlyBudget: 0 })).toMatchObject({
      status: "ok",
      dailyRatio: null,
      monthlyRatio: null,
    });
  });

  it("marks an exact one ratio over", () => {
    expect(evaluateBudget(10, 0, { ...noBudget, dailyBudget: 10 })).toMatchObject({
      status: "over",
      dailyRatio: 1,
      reason: "Daily budget exceeded",
    });
  });

  it("uses daily over before monthly over and warning reasons", () => {
    expect(
      evaluateBudget(10, 10, {
        dailyBudget: 10,
        monthlyBudget: 10,
        warningThreshold: 0.8,
      }).reason,
    ).toBe("Daily budget exceeded");
    expect(
      evaluateBudget(8, 1, {
        dailyBudget: 10,
        monthlyBudget: 10,
        warningThreshold: 0.8,
      }).reason,
    ).toBe("Daily budget warning");
    expect(
      evaluateBudget(1, 8, {
        dailyBudget: 10,
        monthlyBudget: 10,
        warningThreshold: 0.8,
      }).reason,
    ).toBe("Monthly budget warning");
  });
});
