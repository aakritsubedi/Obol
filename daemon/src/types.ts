/**
 * Compatibility barrel for the daemon's historical imports.
 *
 * Public response types come from @obol/contract. The ccusage shapes and
 * normalizers stay behind data/ccusage, while the old names remain available
 * to downstream daemon modules during the migration.
 */
export type {
  ActiveSession,
  BlocksReport,
  BudgetConfig,
  BudgetEvaluation,
  BudgetStatus,
  BurnRate,
  DayJournal,
  JournalProject,
  JournalSession,
  ModelBreakdown,
  Projection,
  ProviderSummary,
  RuntimeState,
  Summary,
  SummaryToday,
  TokenCounts,
  TokenLimitStatus,
  UsageBlock,
  WidgetConfig,
} from "@obol/contract";
export {
  normalizeBlocks,
  normalizeBurnRate,
  normalizeProjection,
  normalizeProjects,
  normalizeReport,
  normalizeRow,
} from "./data/ccusage/normalize.js";
export type { CcusageReport, CcusageRow, ProjectUsageRow } from "./data/ccusage/types.js";
export { emptyBlocks, emptyJournal, emptyReport } from "./domain/factories.js";
export { asRecord, numberValue, stringValue } from "./shared/coerce.js";

import type { BlocksReport, Summary } from "@obol/contract";
import type { CcusageReport } from "./data/ccusage/types.js";

export interface Snapshot {
  report: CcusageReport;
  blocks: BlocksReport;
  summary: Summary;
  updatedAt: string | null;
  refreshedAt: string | null;
  error: string | null;
}

export interface RefreshResult {
  report: CcusageReport | null;
  fullReport?: CcusageReport | null;
  blocks: BlocksReport | null;
  errors: string[];
}
