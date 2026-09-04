import type { WidgetConfig } from "@obol/contract";
import type { ConfigStore } from "../data/config-store.js";
import type { SnapshotStore } from "../data/snapshot-store.js";
import type { JournalService } from "./JournalService.js";
import type { UsageService } from "./UsageService.js";

export interface ConfigServiceOptions {
  configStore: ConfigStore;
  store: SnapshotStore;
  getConfig: () => WidgetConfig;
  setConfig: (config: WidgetConfig) => void;
  usage: UsageService;
  journal: JournalService;
  onRefreshIntervalChange: (milliseconds: number) => void;
  onChanged: () => void;
}

/** Applies config patches and keeps their dependent runtime services in sync. */
export class ConfigService {
  constructor(private readonly options: ConfigServiceOptions) {}

  async update(patch: Partial<WidgetConfig>): Promise<WidgetConfig> {
    const config = await this.options.configStore.update(patch);
    this.options.setConfig(config);
    await this.options.store.reconfigure(config);
    if (patch.refreshIntervalMs !== undefined) {
      this.options.onRefreshIntervalChange(config.refreshIntervalMs);
    }
    if (patch.historyDays !== undefined) {
      await this.options.usage.scheduleRefresh(true);
    }
    if (patch.journalIdleMinutes !== undefined) {
      this.options.journal.clear();
    }
    this.options.onChanged();
    return config;
  }
}
