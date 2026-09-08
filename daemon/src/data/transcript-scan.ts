import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dateForTimeZone } from "../domain/time.js";
import {
  type DayCounters,
  emptyDay,
  emptySession,
  type ProviderAdapter,
  type SessionAccumulator,
  type TranscriptFile,
} from "../providers/types.js";
import { asRecord } from "../shared/coerce.js";

/** One transcript's own contribution to a day, before sessions are merged. */
export interface TranscriptTotals {
  session: SessionAccumulator;
  day: DayCounters;
}

interface FileScan extends TranscriptTotals {
  mtimeMs: number;
  /** The file's length when it was last scanned, to tell growth from a rewrite. */
  size: number;
  /**
   * Bytes already folded in. Always lands just past a newline, never inside a
   * record: an agent writing its transcript leaves a torn final line, and
   * resuming past one would read the rest of that line as a record of its own
   * and lose it. So this trails `size` whenever a write is still in progress.
   */
  offset: number;
}

/**
 * Dates kept at once. Totals are filtered to a single day, so each day browsed
 * is a cache of its own; today's is the one that has to survive somebody
 * paging back through the week.
 */
const MAX_CACHED_DATES = 3;

const NEWLINE = 0x0a;

/**
 * Reads newline-delimited JSON from `start`, and reports the offset it stopped
 * at — the end of the last complete line, so an incomplete tail is left for the
 * next pass rather than being consumed half-written.
 */
async function readJsonlFrom(
  path: string,
  start: number,
  onRecord: (record: Record<string, unknown>) => void,
): Promise<number> {
  const stream = createReadStream(path, { start });
  let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let read = 0;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      read += chunk.length;
      const buffer = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      const lastNewline = buffer.lastIndexOf(NEWLINE);
      if (lastNewline === -1) {
        pending = buffer;
        continue;
      }
      // Split only the complete part, so a multi-byte character straddling a
      // chunk boundary is never decoded in halves.
      const complete = buffer.subarray(0, lastNewline + 1).toString("utf8");
      // Copied rather than sliced: a subarray would pin the whole chunk in
      // memory for the sake of one partial line.
      pending = Buffer.from(buffer.subarray(lastNewline + 1));
      for (const line of complete.split("\n")) {
        if (!line.trim()) continue;
        try {
          onRecord(asRecord(JSON.parse(line)));
        } catch {
          // A torn or malformed line is normal in a live transcript.
        }
      }
    }
  } finally {
    stream.close();
  }
  return start + read - pending.length;
}

/**
 * Per-transcript totals, cached and resumed across reads.
 *
 * A day's journal used to re-parse every transcript touched in the last day and
 * a half on every read, and the transcript being appended to is exactly the one
 * a read is triggered by — so the most expensive file was re-read in full every
 * time. Totals are additive, so a file's own contribution is cached and only
 * its appended bytes are parsed on the next pass.
 */
export class TranscriptScanner {
  /** date -> transcript key -> that transcript's totals for the date. */
  private readonly byDate = new Map<string, Map<string, FileScan>>();

  /** Cursor and OpenCode read from SQLite, where there is no byte to resume at. */
  private static resumable(provider: ProviderAdapter): boolean {
    return provider.read === undefined;
  }

  private static key(provider: ProviderAdapter, file: TranscriptFile): string {
    // Several Cursor conversations share one database path, so the source id
    // has to be part of the key or they would overwrite each other.
    return `${provider.id}:${file.path}:${file.sourceId ?? file.sessionId}`;
  }

  async scan(
    provider: ProviderAdapter,
    file: TranscriptFile,
    date: string,
    timezone: string,
  ): Promise<TranscriptTotals> {
    const key = TranscriptScanner.key(provider, file);
    const cached = this.forDate(date).get(key);
    let mtimeMs = 0;
    let size = 0;
    try {
      const stats = await stat(file.path);
      mtimeMs = stats.mtimeMs;
      size = stats.size;
    } catch {
      // Unreadable now: the cached totals are the best answer available.
      if (cached) return cached;
      return { session: emptySession(file.sessionId, provider.id, file.projectDir), day: emptyDay() };
    }

    // Untouched since the last scan: the totals still stand, and the file is
    // not opened at all.
    if (cached && size === cached.size && mtimeMs === cached.mtimeMs) return cached;

    // Only growth can be resumed. A file that shrank was truncated, and one
    // that kept its length while its mtime moved was rewritten in place —
    // either way the cached totals describe bytes that are no longer there.
    const grew = cached !== undefined && size > cached.size && mtimeMs >= cached.mtimeMs;
    const resume = grew && TranscriptScanner.resumable(provider);
    const scan: FileScan = resume
      ? { ...cached, mtimeMs, size }
      : {
          session: emptySession(file.sessionId, provider.id, file.projectDir),
          day: emptyDay(),
          offset: 0,
          size,
          mtimeMs,
        };

    const consume = (record: Record<string, unknown>): void => {
      provider.meta?.(record, scan.session, file);
      const timestamp = provider.timestampOf(record);
      if (timestamp === null) return;
      if (dateForTimeZone(new Date(timestamp), timezone) !== date) return;
      scan.session.timestamps.push(timestamp);
      provider.consume(record, scan.session, scan.day, file);
    };

    if (provider.read) {
      for await (const record of provider.read(file)) consume(record);
      scan.offset = size;
    } else {
      scan.offset = await readJsonlFrom(file.path, scan.offset, consume);
    }

    this.forDate(date).set(key, scan);
    return scan;
  }

  /**
   * Re-inserted so the map's own insertion order is a least-recently-used
   * order, which is what bounds the cache to the days actually being read.
   */
  private forDate(date: string): Map<string, FileScan> {
    const existing = this.byDate.get(date);
    if (existing) {
      this.byDate.delete(date);
      this.byDate.set(date, existing);
      return existing;
    }
    const created = new Map<string, FileScan>();
    this.byDate.set(date, created);
    return created;
  }

  /**
   * Drops what the day just read no longer covers: transcripts that have fallen
   * out of its window, and the least recently read days beyond the cap. Only
   * the date just read is pruned by key, so paging through history cannot
   * evict today's entries — the ones a live session keeps growing.
   */
  retain(date: string, keys: Set<string>): void {
    const scans = this.byDate.get(date);
    if (scans) {
      for (const key of scans.keys()) {
        if (!keys.has(key)) scans.delete(key);
      }
    }
    while (this.byDate.size > MAX_CACHED_DATES) {
      const oldest = this.byDate.keys().next();
      if (oldest.done) break;
      this.byDate.delete(oldest.value);
    }
  }

  static keyFor(provider: ProviderAdapter, file: TranscriptFile): string {
    return TranscriptScanner.key(provider, file);
  }

  clear(): void {
    this.byDate.clear();
  }
}
