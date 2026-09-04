import { describe, expect, it } from "vitest";
import type { UsageRow } from "../api";
import { exportCsv, exportJson } from "./export";

function row(overrides: Partial<UsageRow> & Record<string, unknown>): UsageRow {
  return {
    period: "2026-08-21",
    agents: [],
    modelBreakdowns: [],
    modelsUsed: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0,
    totalTokens: 0,
    metadata: {},
    ...overrides,
  };
}

describe("exportCsv", () => {
  it("writes a header and one line per provider group", () => {
    const rows = [
      row({
        period: "2026-08-20",
        agents: [
          {
            agent: "claude",
            totalCost: 1.5,
            totalTokens: 100,
            inputTokens: 60,
            outputTokens: 40,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
          },
          {
            agent: "codex",
            totalCost: 2.5,
            totalTokens: 200,
            inputTokens: 120,
            outputTokens: 80,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
          },
        ],
      }),
      row({
        period: "2026-08-21",
        totalCost: 3,
        totalTokens: 300,
        inputTokens: 180,
        outputTokens: 120,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    ];
    const csv = exportCsv(rows, "cost");
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("metric,period,group,costUSD,totalTokens,inputTokens,outputTokens,cacheReadTokens");
    expect(lines[1]).toBe('"cost","2026-08-20","claude","1.5","100","60","40","0"');
    expect(lines[2]).toBe('"cost","2026-08-20","codex","2.5","200","120","80","0"');
    expect(lines[3]).toBe('"cost","2026-08-21","All","3","300","180","120","0"');
  });

  it("prefers the project label for project rows without agents", () => {
    const csv = exportCsv([row({ project: "-Users-dev-app", agent: "claude" })], "tokens");
    expect(csv).toContain('"-Users-dev-app"');
  });

  it("escapes embedded quotes", () => {
    const csv = exportCsv(
      [
        row({
          agents: [
            {
              agent: 'we"ird',
              totalCost: 0,
              totalTokens: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
            },
          ],
        }),
      ],
      "cost",
    );
    expect(csv).toContain('"we""ird"');
  });
});

describe("exportJson", () => {
  it("embeds the view metadata with the rows", () => {
    const rows = [row({ period: "2026-08-21", totalCost: 4 })];
    const json = JSON.parse(exportJson({ period: "daily", rangeDays: 30, metric: "tokens", rows }));
    expect(json).toEqual({ period: "daily", rangeDays: 30, metric: "tokens", rows });
  });
});
