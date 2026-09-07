import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  BUNDLED_PRICING,
  type ModelPrice,
  mergePricingTables,
  type PricingEntry,
  type PricingTable,
} from "../domain/pricing.js";
import { asRecord, stringValue } from "../shared/coerce.js";
import { statePaths } from "./config-store.js";

export const PRICING_URL = "https://www.aipricing.guru/api/pricing.json";
export const PRICING_REFRESH_MS = 24 * 60 * 60 * 1_000;

export interface PricingResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type PricingFetcher = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<PricingResponse>;

interface PricingCacheFile {
  version: 1;
  fetchedAt: string | null;
  lastCheckedAt: string;
  sourceUpdatedAt: string | null;
  entries: PricingEntry[];
}

interface PricingSnapshot {
  cache: PricingCacheFile;
  table: PricingTable;
}

export interface PricingStoreOptions {
  now?: () => Date;
  fetcher?: PricingFetcher;
  url?: string;
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = finiteNonNegative(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function priceEntry(value: unknown): PricingEntry | null {
  const input = asRecord(value);
  const price = asRecord(input.price);
  const id = stringValue(input.id).trim();
  const aliases = Array.isArray(input.aliases)
    ? input.aliases.map((alias) => stringValue(alias).trim()).filter(Boolean)
    : [];
  const inputRate = finiteNonNegative(price.input);
  const outputRate = finiteNonNegative(price.output);
  const cacheReadRate = finiteNonNegative(price.cacheRead);
  const cacheWriteRate = finiteNonNegative(price.cacheWrite);
  if (!id || aliases.length === 0 || inputRate === null || outputRate === null) return null;
  if (cacheReadRate === null || cacheWriteRate === null) return null;
  const modelPrice: ModelPrice = {
    input: inputRate,
    output: outputRate,
    cacheRead: cacheReadRate,
    cacheWrite: cacheWriteRate,
  };
  return { id, aliases, price: modelPrice };
}

function entriesFromPayload(value: unknown): { entries: PricingEntry[]; sourceUpdatedAt: string | null } {
  const input = asRecord(value);
  const models = Array.isArray(input.models) ? input.models : [];
  const entries: PricingEntry[] = [];
  for (const item of models) {
    const model = asRecord(item);
    const pricing = asRecord(model.pricing);
    const inputRate = firstNumber(pricing, ["inputPerM", "inputPer1M"]);
    const outputRate = firstNumber(pricing, ["outputPerM", "outputPer1M"]);
    if (inputRate === null && outputRate === null) continue;

    // The feed publishes cached-input when the provider has a separate cache
    // rate. When it does not, charging cache reads as ordinary input and cache
    // writes at the existing 1.25x convention avoids silently pricing those
    // tokens at zero.
    const inputValue = inputRate ?? 0;
    const cacheRead = firstNumber(pricing, ["cachedInputPerM", "cacheReadPerM"]) ?? inputValue;
    const cacheWrite = firstNumber(pricing, ["cacheWritePerM", "cacheWriteInputPerM"]) ?? inputValue * 1.25;
    const id = stringValue(model.id).trim();
    const aliases = [model.id, model.name, model.family]
      .map((alias) => stringValue(alias).trim())
      .filter((alias, index, values) => Boolean(alias) && values.indexOf(alias) === index);
    if (!id || aliases.length === 0) continue;

    entries.push({
      id,
      aliases,
      price: {
        input: inputValue,
        output: outputRate ?? 0,
        cacheRead,
        cacheWrite,
      },
    });
  }

  return {
    entries,
    sourceUpdatedAt: stringValue(input.lastUpdated ?? input.scrapedAt).trim() || null,
  };
}

function tableFor(cache: PricingCacheFile): PricingTable {
  return mergePricingTables({
    source: PRICING_URL,
    fetchedAt: cache.fetchedAt ?? undefined,
    sourceUpdatedAt: cache.sourceUpdatedAt,
    entries: cache.entries,
  });
}

function validTimestamp(value: unknown): string | null {
  const text = stringValue(value).trim();
  if (!text || !Number.isFinite(Date.parse(text))) return null;
  return text;
}

function parseCache(value: unknown): PricingCacheFile | null {
  const input = asRecord(value);
  if (input.version !== 1) return null;
  const lastCheckedAt = validTimestamp(input.lastCheckedAt ?? input.fetchedAt);
  if (!lastCheckedAt) return null;
  const entries = Array.isArray(input.entries)
    ? input.entries.map(priceEntry).filter((entry): entry is PricingEntry => entry !== null)
    : [];
  return {
    version: 1,
    fetchedAt: validTimestamp(input.fetchedAt),
    lastCheckedAt,
    sourceUpdatedAt: validTimestamp(input.sourceUpdatedAt),
    entries,
  };
}

function freshSince(timestamp: string, nowMs: number): boolean {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs) && nowMs >= timestampMs && nowMs - timestampMs < PRICING_REFRESH_MS;
}

export class PricingStore {
  private snapshot: PricingSnapshot | null = null;
  private loaded = false;
  private lastAttemptAt: number | null = null;
  private readonly now: () => Date;
  private readonly fetcher: PricingFetcher;
  private readonly url: string;

  constructor(
    private readonly path = statePaths().pricing,
    options: PricingStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
    this.url = options.url ?? PRICING_URL;
  }

  async load(): Promise<PricingTable> {
    const now = this.now();
    const nowMs = now.getTime();
    if (!this.loaded) {
      this.loaded = true;
      this.snapshot = await this.readCache();
    }

    if (this.snapshot && freshSince(this.snapshot.cache.lastCheckedAt, nowMs)) {
      return this.snapshot.table;
    }
    if (
      this.lastAttemptAt !== null &&
      nowMs >= this.lastAttemptAt &&
      nowMs - this.lastAttemptAt < PRICING_REFRESH_MS
    ) {
      return this.snapshot?.table ?? BUNDLED_PRICING;
    }

    this.lastAttemptAt = nowMs;
    try {
      const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(15_000) : undefined;
      const response = await this.fetcher(this.url, {
        headers: { accept: "application/json" },
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw new Error(`pricing feed returned HTTP ${response.status}`);
      const parsed = entriesFromPayload(await response.json());
      if (parsed.entries.length === 0) throw new Error("pricing feed contained no usable models");

      const timestamp = now.toISOString();
      const cache: PricingCacheFile = {
        version: 1,
        fetchedAt: timestamp,
        lastCheckedAt: timestamp,
        sourceUpdatedAt: parsed.sourceUpdatedAt,
        entries: parsed.entries,
      };
      this.snapshot = { cache, table: tableFor(cache) };
      await this.writeCache(cache);
    } catch {
      const timestamp = now.toISOString();
      const cache = this.snapshot?.cache ?? {
        version: 1 as const,
        fetchedAt: null,
        lastCheckedAt: timestamp,
        sourceUpdatedAt: null,
        entries: [],
      };
      const checked: PricingCacheFile = { ...cache, lastCheckedAt: timestamp };
      this.snapshot = { cache: checked, table: tableFor(checked) };
      await this.writeCache(checked).catch(() => undefined);
    }

    return this.snapshot?.table ?? BUNDLED_PRICING;
  }

  private async readCache(): Promise<PricingSnapshot | null> {
    try {
      const cache = parseCache(JSON.parse(await readFile(this.path, "utf8")));
      return cache ? { cache, table: tableFor(cache) } : null;
    } catch {
      return null;
    }
  }

  private async writeCache(cache: PricingCacheFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.path);
  }
}
