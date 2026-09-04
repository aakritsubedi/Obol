import type { ProjectUsageRow, UsageRow } from "@shared/api";
import { numberValue, projectName } from "@shared/lib/format";
import { providerName } from "@shared/providers/catalog";

export type ChartMetric = "cost" | "tokens";
export type ChartGroupBy = "agent" | "project";

export interface ChartGroup {
  key: string;
  label: string;
  value: number;
  cost: number;
  tokens: number;
}

export interface ChartPoint {
  period: string;
  groups: ChartGroup[];
}

export function niceScale(maxValue: number): { max: number; step: number } {
  const roughStep = Math.max(maxValue / 4, 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  return { step, max: Math.ceil(maxValue / step) * step || step };
}

export function labelIndexes(count: number): Set<number> {
  if (count <= 1) return new Set([0]);
  const step = Math.max(1, Math.ceil((count - 1) / 6));
  return new Set([...Array(count).keys()].filter((index) => index % step === 0 || index === count - 1));
}

function groupValue(row: UsageRow, metric: ChartMetric): number {
  return numberValue(metric === "cost" ? row.totalCost : row.totalTokens);
}

export function chartPoints(
  rows: UsageRow[],
  metric: ChartMetric,
  groupBy: ChartGroupBy = "agent",
): ChartPoint[] {
  if (groupBy === "project") {
    const points = new Map<string, Map<string, ChartGroup>>();
    const totals = new Map<string, number>();
    for (const row of rows) {
      const project = projectName(
        String((row as ProjectUsageRow).project || row.metadata?.project || "Unknown project"),
      );
      const groups = points.get(row.period) || new Map<string, ChartGroup>();
      const current = groups.get(project) || {
        key: project,
        label: projectName(project),
        value: 0,
        cost: 0,
        tokens: 0,
      };
      current.value += groupValue(row, metric);
      current.cost += numberValue(row.totalCost);
      current.tokens += numberValue(row.totalTokens);
      groups.set(project, current);
      totals.set(project, (totals.get(project) || 0) + groupValue(row, metric));
      points.set(row.period, groups);
    }
    const topProjects = [...totals.entries()]
      .sort(([, left], [, right]) => right - left)
      .slice(0, 6)
      .map(([project]) => project);
    return [...points.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, groups]) => ({
        period,
        groups: [...groups.values()]
          .filter((group) => topProjects.includes(group.key))
          .concat({
            key: "__other__",
            label: "Other",
            value: [...groups.values()]
              .filter((group) => !topProjects.includes(group.key))
              .reduce((sum, group) => sum + group.value, 0),
            cost: [...groups.values()]
              .filter((group) => !topProjects.includes(group.key))
              .reduce((sum, group) => sum + group.cost, 0),
            tokens: [...groups.values()]
              .filter((group) => !topProjects.includes(group.key))
              .reduce((sum, group) => sum + group.tokens, 0),
          })
          .filter((group) => group.value > 0)
          .sort((left, right) => right.value - left.value),
      }));
  }

  return rows.map((row) => ({
    period: row.period,
    groups: row.agents
      .map((agent) => ({
        key: agent.agent,
        label: providerName(agent.agent),
        value: numberValue(metric === "cost" ? agent.totalCost : agent.totalTokens),
        cost: numberValue(agent.totalCost),
        tokens: numberValue(agent.totalTokens),
      }))
      .sort((left, right) => right.value - left.value),
  }));
}
