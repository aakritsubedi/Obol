import type { ModelBreakdown, Report, ReportTotals } from "@shared/api";
import { numberValue } from "@shared/lib/format";

export function modelName(model: ModelBreakdown): string {
  return String(model.modelName ?? model.model ?? model.name ?? "Unknown model");
}

const zeroTotals: ReportTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0,
  totalTokens: 0,
};

function reduceRows(report: Report): ReportTotals {
  return report.daily.reduce<ReportTotals>(
    (totals, row) => {
      totals.inputTokens += numberValue(row.inputTokens);
      totals.outputTokens += numberValue(row.outputTokens);
      totals.cacheCreationTokens += numberValue(row.cacheCreationTokens);
      totals.cacheReadTokens += numberValue(row.cacheReadTokens);
      totals.totalCost += numberValue(row.totalCost);
      totals.totalTokens += numberValue(row.totalTokens);
      return totals;
    },
    { ...zeroTotals },
  );
}

export function totalsFrom(report: Report | null): ReportTotals {
  if (!report) return { ...zeroTotals };
  const reduced = reduceRows(report);
  const totals = report.totals;
  if (!totals) return reduced;
  return {
    inputTokens: Number.isFinite(Number(totals.inputTokens))
      ? numberValue(totals.inputTokens)
      : reduced.inputTokens,
    outputTokens: Number.isFinite(Number(totals.outputTokens))
      ? numberValue(totals.outputTokens)
      : reduced.outputTokens,
    cacheCreationTokens: Number.isFinite(Number(totals.cacheCreationTokens))
      ? numberValue(totals.cacheCreationTokens)
      : reduced.cacheCreationTokens,
    cacheReadTokens: Number.isFinite(Number(totals.cacheReadTokens))
      ? numberValue(totals.cacheReadTokens)
      : reduced.cacheReadTokens,
    totalCost: Number.isFinite(Number(totals.totalCost)) ? numberValue(totals.totalCost) : reduced.totalCost,
    totalTokens: Number.isFinite(Number(totals.totalTokens))
      ? numberValue(totals.totalTokens)
      : reduced.totalTokens,
  };
}
