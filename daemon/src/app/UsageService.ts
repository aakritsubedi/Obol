import type { WidgetConfig } from "@obol/contract";
import type { CcusageReport } from "../data/ccusage/types.js";
import type { SnapshotStore } from "../data/snapshot-store.js";
import { emptyBlocks } from "../domain/factories.js";
import { runUsage } from "../infra/process.js";

export interface UsageServiceOptions {
  getConfig: () => WidgetConfig;
  getLiveReport: () => CcusageReport;
  setLiveReport: (report: CcusageReport) => void;
  store: SnapshotStore;
  onChanged: () => void;
}

/** Coordinates refresh triggers while keeping snapshot persistence out of the bootstrap. */
export class UsageService {
  private refreshPromise: Promise<void> | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: UsageServiceOptions) {}

  async refreshNow(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const result = await runUsage(this.options.getConfig());
      const current = this.options.store.get();
      if (result.report || result.blocks) {
        const report = result.report ?? current.report;
        const blocks = result.blocks ?? emptyBlocks();
        this.options.setLiveReport(result.fullReport ?? result.report ?? this.options.getLiveReport());
        const message = result.errors.length ? result.errors.join("; ") : null;
        await this.options.store.apply(report, blocks, this.options.getConfig(), message);
        this.options.onChanged();
      } else {
        await this.options.store.markError(
          this.options.getConfig(),
          result.errors.join("; ") || "ccusage refresh failed",
        );
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
