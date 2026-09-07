import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { ActiveSession, DayJournal, WidgetConfig } from "@obol/contract";
import type { CcusageReport } from "../data/ccusage/types.js";
import { activeSessions, readDayJournal } from "../data/journal.js";
import { dateForTimeZone, systemTime, type TimeSource } from "../domain/time.js";

export interface JournalServiceOptions {
  getConfig: () => WidgetConfig;
  getLiveReport: () => CcusageReport;
  time?: TimeSource;
}

interface JournalCacheEntry {
  journal: DayJournal;
  idleMinutes: number;
  sourceMtimes: Map<string, number>;
}

/** Owns the transcript-derived cache and its invalidation rules. */
export class JournalService {
  private readonly cache = new Map<string, JournalCacheEntry>();
  private readonly time: TimeSource;

  constructor(private readonly options: JournalServiceOptions) {
    this.time = options.time ?? systemTime;
  }

  forgetToday(changedPath?: string): void {
    const date = dateForTimeZone(this.time.now(), this.time.timeZone());
    const cached = this.cache.get(date);
    if (!cached || !this.hasSourceChanged(cached.sourceMtimes, changedPath)) return;
    this.cache.delete(date);
  }

  clear(): void {
    this.cache.clear();
  }

  async read(requested: string | null): Promise<DayJournal> {
    const config = this.options.getConfig();
    const timezone = this.time.timeZone();
    const date = requested ?? dateForTimeZone(this.time.now(), timezone);
    const cached = this.cache.get(date);
    if (
      cached &&
      cached.idleMinutes === config.journalIdleMinutes &&
      !this.hasSourceChanged(cached.sourceMtimes)
    ) {
      return cached.journal;
    }
    const sourcePaths = new Set<string>();
    const journal = await readDayJournal({
      date,
      timezone,
      idleMinutes: config.journalIdleMinutes,
      report: this.options.getLiveReport(),
      onSourcePath: (path) => sourcePaths.add(resolve(path)),
    });
    // A report-less journal has no project costs to join, so do not pin a
    // zero-cost result for the rest of the day before the first refresh.
    if (this.options.getLiveReport().projects.length > 0) {
      this.cache.set(date, {
        journal,
        idleMinutes: config.journalIdleMinutes,
        sourceMtimes: this.sourceMtimes(sourcePaths),
      });
    }
    return journal;
  }

  async active(): Promise<ActiveSession[]> {
    const journal = await this.read(null);
    return activeSessions(journal, this.time.now(), this.options.getConfig().journalIdleMinutes);
  }

  private sourceMtimes(paths: Set<string>): Map<string, number> {
    const mtimes = new Map<string, number>();
    for (const path of paths) {
      try {
        mtimes.set(path, statSync(path).mtimeMs);
      } catch {
        // A source can disappear between discovery and the cache write.
      }
    }
    return mtimes;
  }

  private hasSourceChanged(sourceMtimes: Map<string, number>, changedPath?: string): boolean {
    if (changedPath) {
      const path = resolve(changedPath);
      if (!sourceMtimes.has(path)) return true;
      try {
        return statSync(path).mtimeMs > (sourceMtimes.get(path) ?? 0);
      } catch {
        return true;
      }
    }

    for (const [path, previousMtime] of sourceMtimes) {
      try {
        if (statSync(path).mtimeMs > previousMtime) return true;
      } catch {
        return true;
      }
    }
    return false;
  }
}
