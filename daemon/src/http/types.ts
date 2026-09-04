import type { ActiveSession, BlocksReport, DayJournal, Summary, WidgetConfig } from "@obol/contract";
import type { CcusageReport } from "../data/ccusage/types.js";

export interface ServerHandlers {
  getSummary: () => Summary;
  getReport: () => CcusageReport;
  getBlocks: () => BlocksReport;
  getConfig: () => WidgetConfig;
  updateConfig: (patch: Partial<WidgetConfig>) => Promise<WidgetConfig>;
  refresh: () => Promise<void>;
  getJournal: (date: string | null) => Promise<DayJournal>;
  getActiveSessions: () => Promise<ActiveSession[]>;
}

export interface ServerOptions {
  port: number;
  token: string;
  staticRoot: string;
  handlers: ServerHandlers;
}
