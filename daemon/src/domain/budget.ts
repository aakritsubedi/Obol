import type { BudgetConfig, BudgetEvaluation, BudgetStatus } from "@obol/contract";

export function evaluateBudget(
  dailyCost: number,
  monthlyCost: number,
  config: BudgetConfig,
): BudgetEvaluation {
  const dailyRatio = config.dailyBudget && config.dailyBudget > 0 ? dailyCost / config.dailyBudget : null;
  const monthlyRatio =
    config.monthlyBudget && config.monthlyBudget > 0 ? monthlyCost / config.monthlyBudget : null;
  const ratios = [dailyRatio, monthlyRatio].filter((ratio): ratio is number => ratio !== null);
  const maximumRatio = ratios.length ? Math.max(...ratios) : 0;
  // With no budget configured there is nothing to be over or near, regardless
  // of the threshold: a zero threshold would otherwise match a zero ratio.
  const status: BudgetStatus =
    ratios.length === 0
      ? "ok"
      : maximumRatio >= 1
        ? "over"
        : maximumRatio >= config.warningThreshold
          ? "warn"
          : "ok";

  let reason: string | null = null;
  if (dailyRatio !== null && dailyRatio >= 1) reason = "Daily budget exceeded";
  else if (monthlyRatio !== null && monthlyRatio >= 1) reason = "Monthly budget exceeded";
  else if (dailyRatio !== null && dailyRatio >= config.warningThreshold) reason = "Daily budget warning";
  else if (monthlyRatio !== null && monthlyRatio >= config.warningThreshold)
    reason = "Monthly budget warning";

  return { status, dailyRatio, monthlyRatio, reason };
}
