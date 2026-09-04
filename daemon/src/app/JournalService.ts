import type { ActiveSession, DayJournal, WidgetConfig } from "@obol/contract";
import type { CcusageReport } from "../data/ccusage/types.js";
import { activeSessions, readDayJournal } from "../data/journal.js";
import { dateForTimeZone, systemTime, type TimeSource } from "../domain/time.js";

export interface JournalServiceOptions {
  getConfig: () => WidgetConfig;
  getLiveReport: () => CcusageReport;
  time?: TimeSource;
}

/** Owns the transcript-derived cache and its invalidation rules. */
export class JournalService {
  private readonly cache = new Map<string, DayJournal>();
  private readonly time: TimeSource;

  constructor(private readonly options: JournalServiceOptions) {
    this.time = options.time ?? systemTime;
  }

  forgetToday(): void {
    this.cache.delete(dateForTimeZone(this.time.now(), this.time.timeZone()));
  }

  clear(): void {
    this.cache.clear();
  }

  async read(requested: string | null): Promise<DayJournal> {
    const config = this.options.getConfig();
    const timezone = this.time.timeZone();
    const date = requested ?? dateForTimeZone(this.time.now(), timezone);
    const cached = this.cache.get(date);
    if (cached && cached.idleMinutes === config.journalIdleMinutes) return cached;
    const journal = await readDayJournal({
      date,
      timezone,
      idleMinutes: config.journalIdleMinutes,
      report: this.options.getLiveReport(),
    });
    // A report-less journal has no project costs to join, so do not pin a
    // zero-cost result for the rest of the day before the first refresh.
    if (this.options.getLiveReport().projects.length > 0) this.cache.set(date, journal);
    return journal;
  }

  async active(): Promise<ActiveSession[]> {
    const journal = await this.read(null);
    return activeSessions(journal, this.time.now(), this.options.getConfig().journalIdleMinutes);
  }
}
