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

const REFRESH_DEBOUNCE_MS = 2_000;
const MAX_REFRESH_DEFERRAL_MS = 30_000;
const MAX_REFRESH_FLOOR_MS = 10 * 60 * 1_000;

export { MAX_REFRESH_DEFERRAL_MS };

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
  private scheduledResolve: (() => void) | null = null;
  private firstScheduledAt: number | null = null;
  private lastRefreshCompletedAt: number | null = null;
  private waitingForRefresh = false;
  private refreshFloorMs: number;
  private closed = false;

  constructor(private readonly options: UsageServiceOptions) {
    const configuredFloor = Number(options.getConfig().refreshFloorMs);
    this.refreshFloorMs = Number.isFinite(configuredFloor)
      ? Math.min(MAX_REFRESH_FLOOR_MS, Math.max(0, configuredFloor))
      : 0;
  }

  async refreshNow(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.cancelScheduledRefresh();
    const refreshPromise = (async () => {
      try {
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
        const withProjectPaths = (report: CcusageReport): CcusageReport =>
          attachProjectPaths(report, projectPaths);
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
      } finally {
        this.lastRefreshCompletedAt = Date.now();
      }
    })();
    this.refreshPromise = refreshPromise;
    try {
      await this.refreshPromise;
    } finally {
      if (this.refreshPromise === refreshPromise) this.refreshPromise = null;
    }
  }

  setRefreshFloorMs(milliseconds: number): void {
    const value = Number(milliseconds);
    this.refreshFloorMs = Number.isFinite(value) ? Math.min(MAX_REFRESH_FLOOR_MS, Math.max(0, value)) : 0;
    this.armScheduledRefresh();
  }

  scheduleRefresh(immediate = false): Promise<void> {
    if (immediate) return this.refreshNow();
    if (this.closed) return Promise.resolve();

    const now = Date.now();
    if (this.firstScheduledAt === null) this.firstScheduledAt = now;
    // A superseded caller has no useful work left to wait for. Resolve it now
    // instead of leaving one permanently pending for every filesystem burst.
    this.scheduledResolve?.();
    const promise = new Promise<void>((resolvePromise) => {
      this.scheduledResolve = resolvePromise;
    });
    this.armScheduledRefresh();
    return promise;
  }

  close(): void {
    this.closed = true;
    this.cancelScheduledRefresh();
  }

  private armScheduledRefresh(): void {
    if (!this.scheduledResolve || this.firstScheduledAt === null || this.waitingForRefresh) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const now = Date.now();
    const maxDeferralAt = this.firstScheduledAt + MAX_REFRESH_DEFERRAL_MS;
    const debounceAt = Math.min(now + REFRESH_DEBOUNCE_MS, maxDeferralAt);
    const floorAt =
      this.lastRefreshCompletedAt === null ? now : this.lastRefreshCompletedAt + this.refreshFloorMs;
    const dueAt = Math.max(debounceAt, floorAt);
    this.debounceTimer = setTimeout(
      () => {
        this.debounceTimer = null;
        this.runScheduledRefresh();
      },
      Math.max(0, dueAt - now),
    );
  }

  private runScheduledRefresh(): void {
    if (!this.scheduledResolve || this.firstScheduledAt === null) return;

    const now = Date.now();
    const floorAt =
      this.lastRefreshCompletedAt === null ? now : this.lastRefreshCompletedAt + this.refreshFloorMs;
    if (floorAt > now) {
      this.armScheduledRefresh();
      return;
    }

    if (this.refreshPromise) {
      if (this.waitingForRefresh) return;
      this.waitingForRefresh = true;
      const current = this.refreshPromise;
      void current.then(
        () => this.resumeScheduledRefresh(),
        () => this.resumeScheduledRefresh(),
      );
      return;
    }

    const resolvePromise = this.scheduledResolve;
    this.scheduledResolve = null;
    this.firstScheduledAt = null;
    void this.refreshNow().then(resolvePromise, resolvePromise);
  }

  private resumeScheduledRefresh(): void {
    this.waitingForRefresh = false;
    if (this.scheduledResolve) this.runScheduledRefresh();
  }

  private cancelScheduledRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.scheduledResolve?.();
    this.scheduledResolve = null;
    this.firstScheduledAt = null;
    this.waitingForRefresh = false;
  }
}
