import type { UsageRow } from "../api/types";

export type ExportMetric = "cost" | "tokens";

export interface ExportPayload {
  period: string;
  rangeDays: number;
  metric: ExportMetric;
  rows: UsageRow[];
}

export function exportValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/"/g, '""');
}

export function exportCsv(rows: UsageRow[], metric: ExportMetric): string {
  const header = [
    "metric",
    "period",
    "group",
    "costUSD",
    "totalTokens",
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
  ];
  const values = rows.flatMap((row) => {
    const groups = row.agents.length
      ? row.agents.map((agent) => ({
          group: agent.agent,
          cost: agent.totalCost,
          tokens: agent.totalTokens,
          input: agent.inputTokens,
          output: agent.outputTokens,
          cache: agent.cacheReadTokens,
        }))
      : [
          {
            group: String((row as UsageRow & { project?: string }).project || row.agent || "All"),
            cost: row.totalCost,
            tokens: row.totalTokens,
            input: row.inputTokens,
            output: row.outputTokens,
            cache: row.cacheReadTokens,
          },
        ];
    return groups.map((group) =>
      [metric, row.period, group.group, group.cost, group.tokens, group.input, group.output, group.cache]
        .map(exportValue)
        .map((value) => `"${value}"`)
        .join(","),
    );
  });
  return `${header.join(",")}\n${values.join("\n")}\n`;
}

export function exportJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}
