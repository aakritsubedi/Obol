import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeState, WidgetConfig } from "./types.js";

const LEGACY_STATE_DIRECTORY = ".token-cost-widget";

export const DEFAULT_CONFIG: WidgetConfig = {
  port: 4737,
  refreshIntervalMs: 5 * 60 * 1000,
  dailyBudget: null,
  monthlyBudget: null,
  warningThreshold: 0.8,
  launchAtLogin: false,
  keepAwake: false,
  historyDays: 90,
  journalIdleMinutes: 15,
  currency: "USD",
};

export function stateDirectory(): string {
  return process.env.OBOL_HOME || join(homedir(), ".obol");
}

// The app was called Token Cost Widget before it was called Obol. Carry the
// settings and last snapshot over once, so a rename does not reset budgets.
// runtime.json is deliberately left behind: it names a port and pid that belong
// to whichever daemon wrote it, and a stale copy would misdirect the menu bar.
export async function migrateLegacyState(): Promise<void> {
  if (process.env.OBOL_HOME) return;
  const directory = join(homedir(), ".obol");
  const legacy = join(homedir(), LEGACY_STATE_DIRECTORY);
  if (legacy === directory) return;

  try {
    await readFile(join(legacy, "config.json"), "utf8");
  } catch {
    return;
  }

  await mkdir(directory, { recursive: true });
  for (const file of ["config.json", "snapshot.json"]) {
    // COPYFILE_EXCL: a file already in the new directory is newer than the
    // legacy one and must win, so migration stays safe to attempt on every run.
    await copyFile(join(legacy, file), join(directory, file), fsConstants.COPYFILE_EXCL).catch(
      () => undefined,
    );
  }
}

export function statePaths() {
  const directory = stateDirectory();
  return {
    directory,
    config: join(directory, "config.json"),
    runtime: join(directory, "runtime.json"),
    snapshot: join(directory, "snapshot.json"),
  };
}

function nonNegativeOrNull(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// An ISO 4217 alphabetic code and nothing else: the value is handed straight to
// a rate lookup and to Intl.NumberFormat, both of which are stricter than the
// config file is.
function currencyCode(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

function parseConfig(value: unknown): WidgetConfig {
  const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const port = Number(input.port);
  const refreshIntervalMs = Number(input.refreshIntervalMs);
  const warningThreshold = Number(input.warningThreshold);
  const historyDays = Number(input.historyDays);
  const journalIdleMinutes = Number(input.journalIdleMinutes);

  return {
    port: Number.isInteger(port) && port >= 0 && port <= 65535 ? port : DEFAULT_CONFIG.port,
    refreshIntervalMs:
      Number.isFinite(refreshIntervalMs) && refreshIntervalMs >= 10_000
        ? refreshIntervalMs
        : DEFAULT_CONFIG.refreshIntervalMs,
    dailyBudget: nonNegativeOrNull(input.dailyBudget, DEFAULT_CONFIG.dailyBudget),
    monthlyBudget: nonNegativeOrNull(input.monthlyBudget, DEFAULT_CONFIG.monthlyBudget),
    warningThreshold:
      Number.isFinite(warningThreshold) && warningThreshold > 0 && warningThreshold <= 1
        ? warningThreshold
        : DEFAULT_CONFIG.warningThreshold,
    launchAtLogin: Boolean(input.launchAtLogin),
    keepAwake: Boolean(input.keepAwake),
    historyDays:
      Number.isInteger(historyDays) && historyDays >= 7 && historyDays <= 365
        ? historyDays
        : DEFAULT_CONFIG.historyDays,
    journalIdleMinutes:
      Number.isInteger(journalIdleMinutes) && journalIdleMinutes >= 1 && journalIdleMinutes <= 120
        ? journalIdleMinutes
        : DEFAULT_CONFIG.journalIdleMinutes,
    currency: currencyCode(input.currency, DEFAULT_CONFIG.currency),
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
