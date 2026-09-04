import type { BlocksReport, DayJournal } from "@obol/contract";
import type { CcusageReport } from "../data/ccusage/types.js";

export function emptyJournal(date: string, timezone: string, idleMinutes: number): DayJournal {
  return {
    date,
    timezone,
    idleMinutes,
    activeMinutes: 0,
    blocks: 0,
    spanMinutes: 0,
    firstEventAt: null,
    lastEventAt: null,
    humanPrompts: 0,
    assistantTurns: 0,
    toolCalls: 0,
    toolMix: {},
    filesEdited: 0,
    testRuns: 0,
    providers: [],
    sessions: [],
    projects: [],
    totalCost: 0,
    totalTokens: 0,
    computedAt: new Date().toISOString(),
  };
}

export function emptyReport(): CcusageReport {
  return { daily: [], weekly: [], monthly: [], session: [], projects: [], totals: {} };
}

export function emptyBlocks(): BlocksReport {
  return {
    blocks: [],
    burnRate: { costPerHour: 0 },
    projection: { totalCost: 0 },
    tokenLimitStatus: null,
    raw: {},
  };
}
