import type { BlocksReport, Report } from "./report.js";

export interface RuntimeState {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
  dashboardUrl: string;
}

export interface RefreshResult {
  report: Report | null;
  fullReport?: Report | null;
  blocks: BlocksReport | null;
  errors: string[];
}
