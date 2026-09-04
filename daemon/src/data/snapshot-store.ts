import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BlocksReport, WidgetConfig } from "@obol/contract";
import { emptyBlocks, emptyReport } from "../domain/factories.js";
import { buildSummary } from "../domain/summary.js";
import { systemTime, type TimeSource } from "../domain/time.js";
import type { Snapshot } from "../types.js";
import { normalizeBlocks, normalizeReport } from "./ccusage/normalize.js";
import type { CcusageReport } from "./ccusage/types.js";

function emptySnapshot(config: WidgetConfig, time: TimeSource): Snapshot {
  const report = emptyReport();
  const blocks = emptyBlocks();
  return {
    report,
    blocks,
    summary: buildSummary(report, blocks, config, null, true, "No usage snapshot yet", time),
    updatedAt: null,
    refreshedAt: null,
    error: "No usage snapshot yet",
  };
}

export class SnapshotStore {
  private snapshot: Snapshot;
  private readonly path: string;
  private readonly time: TimeSource;

  constructor(path: string, config: WidgetConfig, time: TimeSource = systemTime) {
    this.path = path;
    this.time = time;
    this.snapshot = emptySnapshot(config, time);
  }

  async load(config: WidgetConfig): Promise<Snapshot> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Record<string, unknown>;
      const report = normalizeReport(parsed.report);
      const blocks = normalizeBlocks(parsed.blocks);
      const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
      const refreshedAt = typeof parsed.refreshedAt === "string" ? parsed.refreshedAt : updatedAt;
      const error = typeof parsed.error === "string" ? parsed.error : null;
      this.snapshot = {
        report,
        blocks,
        summary: buildSummary(report, blocks, config, updatedAt, Boolean(error), error, this.time),
        updatedAt,
        refreshedAt,
        error,
      };
    } catch {
      this.snapshot = emptySnapshot(config, this.time);
    }
    return this.get();
  }

  get(): Snapshot {
    return this.snapshot;
  }

  async apply(
    report: CcusageReport,
    blocks: BlocksReport,
    config: WidgetConfig,
    error: string | null = null,
  ): Promise<Snapshot> {
    const now = this.time.now().toISOString();
    this.snapshot = {
      report,
      blocks,
      summary: buildSummary(report, blocks, config, now, Boolean(error), error, this.time),
      updatedAt: now,
      refreshedAt: now,
      error,
    };
    await this.save();
    return this.get();
  }

  async markError(config: WidgetConfig, error: string): Promise<Snapshot> {
    const current = this.snapshot;
    this.snapshot = {
      ...current,
      summary: buildSummary(
        current.report,
        current.blocks,
        config,
        current.updatedAt,
        true,
        error,
        this.time,
      ),
      error,
    };
    await this.save();
    return this.get();
  }

  async reconfigure(config: WidgetConfig): Promise<Snapshot> {
    this.snapshot = {
      ...this.snapshot,
      summary: buildSummary(
        this.snapshot.report,
        this.snapshot.blocks,
        config,
        this.snapshot.updatedAt,
        Boolean(this.snapshot.error),
        this.snapshot.error,
        this.time,
      ),
    };
    await this.save();
    return this.get();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.snapshot, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.path);
  }
}
