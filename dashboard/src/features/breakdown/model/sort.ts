import { modelName } from "@shared/analytics/totals";
import type { AggregatedModel } from "./totals";

export type SortKey =
  | "name"
  | "totalCost"
  | "inputTokens"
  | "outputTokens"
  | "cacheReadTokens"
  | "totalTokens";
export type SortDirection = "asc" | "desc";

export function sortModels(
  models: AggregatedModel[],
  key: SortKey,
  direction: SortDirection,
): AggregatedModel[] {
  return [...models].sort((left, right) => {
    const compared =
      key === "name"
        ? modelName(left).localeCompare(modelName(right))
        : Number(left[key]) - Number(right[key]);
    return (direction === "asc" ? compared : -compared) || modelName(left).localeCompare(modelName(right));
  });
}
