import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { RuntimeState, WidgetConfig } from "./types.js";

export const DEFAULT_CONFIG: WidgetConfig = {
  port: 4737,
  refreshIntervalMs: 5 * 60 * 1000,
  dailyBudget: null,
  monthlyBudget: null,
  warningThreshold: 0.8,
  launchAtLogin: false,
  historyDays: 90
};

export function stateDirectory(): string {
  return process.env.TOKEN_COST_WIDGET_HOME || process.env.TCW_HOME || join(homedir(), ".token-cost-widget");
}

export function statePaths() {
  const directory = stateDirectory();
  return {
    directory,
    config: join(directory, "config.json"),
    runtime: join(directory, "runtime.json"),
    snapshot: join(directory, "snapshot.json")
  };
}

function nonNegativeOrNull(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseConfig(value: unknown): WidgetConfig {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const port = Number(input.port);
  const refreshIntervalMs = Number(input.refreshIntervalMs);
  const warningThreshold = Number(input.warningThreshold);
  const historyDays = Number(input.historyDays);

  return {
    port: Number.isInteger(port) && port >= 0 && port <= 65535 ? port : DEFAULT_CONFIG.port,
    refreshIntervalMs: Number.isFinite(refreshIntervalMs) && refreshIntervalMs >= 10_000
      ? refreshIntervalMs
      : DEFAULT_CONFIG.refreshIntervalMs,
    dailyBudget: nonNegativeOrNull(input.dailyBudget, DEFAULT_CONFIG.dailyBudget),
    monthlyBudget: nonNegativeOrNull(input.monthlyBudget, DEFAULT_CONFIG.monthlyBudget),
    warningThreshold: Number.isFinite(warningThreshold) && warningThreshold > 0 && warningThreshold <= 1
      ? warningThreshold
      : DEFAULT_CONFIG.warningThreshold,
    launchAtLogin: Boolean(input.launchAtLogin),
    historyDays: Number.isInteger(historyDays) && historyDays >= 7 && historyDays <= 365
      ? historyDays
      : DEFAULT_CONFIG.historyDays
  };
}

export class ConfigStore {
  readonly paths = statePaths();
  private value: WidgetConfig = DEFAULT_CONFIG;

  async load(): Promise<WidgetConfig> {
    await mkdir(this.paths.directory, { recursive: true });
    try {
      const contents = await readFile(this.paths.config, "utf8");
      this.value = parseConfig(JSON.parse(contents));
    } catch {
      this.value = { ...DEFAULT_CONFIG };
      await this.save();
    }
    return this.get();
  }

  get(): WidgetConfig {
    return { ...this.value };
  }

  async update(patch: Partial<WidgetConfig>): Promise<WidgetConfig> {
    this.value = parseConfig({ ...this.value, ...patch });
    await this.save();
    return this.get();
  }

  async save(): Promise<void> {
    await mkdir(this.paths.directory, { recursive: true });
    await writeFile(this.paths.config, `${JSON.stringify(this.value, null, 2)}\n`, "utf8");
  }

  async writeRuntime(runtime: RuntimeState): Promise<void> {
    await mkdir(this.paths.directory, { recursive: true });
    await writeFile(this.paths.runtime, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  }

  async clearRuntime(): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    await unlink(this.paths.runtime).catch(() => undefined);
  }
}
