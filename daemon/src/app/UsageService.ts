import type { WidgetConfig } from "@obol/contract";
import type { CcusageReport } from "../data/ccusage/types.js";
import { collectLocalUsage, localUsageSinceMs } from "../data/local-usage.js";
import { attachProjectPaths, collectProjectPaths } from "../data/project-paths.js";
import type { SnapshotStore } from "../data/snapshot-store.js";
import { emptyBlocks } from "../domain/factories.js";
import { systemTime, type TimeSource } from "../domain/time.js";
import { mergeLocalUsage } from "../domain/usage-merge.js";
import { runUsage } from "../infra/process.js";
import { type ProviderAdapter, providers } from "../providers/index.js";

export interface UsageServiceOptions {
  getConfig: () => WidgetConfig;
  getLiveReport: () => CcusageReport;
  setLiveReport: (report: CcusageReport) => void;
  store: SnapshotStore;
  onChanged: () => void;
  providers?: ProviderAdapter[];
  time?: TimeSource;
}

/** Coordinates refresh triggers while keeping snapshot persistence out of the bootstrap. */
export class UsageService {
  private refreshPromise: Promise<void> | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: UsageServiceOptions) {}

  async refreshNow(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const config = this.options.getConfig();
      const result = await runUsage(config);
      const current = this.options.store.get();
      const time = this.options.time ?? systemTime;
      const timezone = time.timeZone();
      const adapters = this.options.providers ?? providers;
      const sinceMs = localUsageSinceMs(config.historyDays, time.now(), timezone);
      const [localRows, projectPaths] = await Promise.all([
        collectLocalUsage(adapters, sinceMs, timezone),
        collectProjectPaths(adapters, sinceMs),
      ]);
      const withProjectPaths = (report: CcusageReport): CcusageReport => attachProjectPaths(report, projectPaths);
      if (result.report || result.blocks || localRows.length > 0) {
        // Local rows may only be merged into a report ccusage just produced.
        // The stored snapshot already contains the last merge, so folding them
        // in again would add the same usage a second time, and keep adding it
        // for as long as ccusage stays unavailable.
        const report = result.report
          ? mergeLocalUsage(withProjectPaths(result.report), localRows)
          : withProjectPaths(current.report);
        const fullReport = result.fullReport ?? result.report;
        const liveReport = fullReport
          ? mergeLocalUsage(withProjectPaths(fullReport), localRows)
          : withProjectPaths(this.options.getLiveReport());
        const blocks = result.blocks ?? emptyBlocks();
        this.options.setLiveReport(liveReport);
        const message = result.errors.length ? result.errors.join("; ") : null;
        await this.options.store.apply(report, blocks, config, message);
        this.options.onChanged();
      } else {
        this.options.setLiveReport(withProjectPaths(this.options.getLiveReport()));
        await this.options.store.markError(config, result.errors.join("; ") || "ccusage refresh failed");
        this.options.onChanged();
      }
    })();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  scheduleRefresh(immediate = false): Promise<void> {
    if (immediate) return this.refreshNow();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolvePromise) => {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        void this.refreshNow().finally(resolvePromise);
      }, 2_000);
    });
  }

  close(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }
}
