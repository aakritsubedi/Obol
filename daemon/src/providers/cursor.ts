import { homedir } from "node:os";
import { join } from "node:path";
import { dateForTimeZone } from "../domain/time.js";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";
import { query, type SqlRow } from "./shared/sqlite.js";
import {
  addPrompt,
  type ProviderAdapter,
  type ProviderUsageDay,
  promptText,
  type TranscriptFile,
} from "./types.js";

const DATABASE = "state.vscdb";
const CURSOR_ROOT = join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage");

function immutableDatabase(path: string): string {
  return `file:${encodeURI(path)}?immutable=1`;
}

function sqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function parsedRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function timestamp(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = stringValue(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectDir(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw || raw === "empty-window") return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "file:") return decodeURIComponent(parsed.pathname).replace(/\//g, "-");
  } catch {
    // Cursor versions have stored both workspace paths and opaque workspace ids.
  }
  return raw.replace(/^file:\/\//, "").replace(/\//g, "-");
}

function parentComposerId(row: SqlRow): string {
  const value = parsedRecord(row.value);
  return stringValue(
    row.parentComposerId ??
      row.parentId ??
      value.parentComposerId ??
      value.parentId ??
      value.parentComposerID,
  ).trim();
}

function composerIdsFor(row: SqlRow, parentById: Map<string, string>): { id: string; root: string } | null {
  const id = stringValue(row.composerId).trim();
  if (!id) return null;
  let root = id;
  const seen = new Set<string>();
  while (parentById.has(root) && !seen.has(root)) {
    seen.add(root);
    root = parentById.get(root) ?? root;
  }
  return { id, root };
}

function modelName(record: Record<string, unknown>): string {
  return stringValue(parsedRecord(record.modelInfo).modelName).trim() || "unknown";
}

function tokenCount(record: Record<string, unknown>): Record<string, unknown> {
  return parsedRecord(record.tokenCount);
}

function bubbleSql(composerId: string): string {
  const prefix = sqlLiteral(`bubbleId:${composerId}:`);
  return `SELECT key, value FROM cursorDiskKV WHERE key LIKE '${prefix}%' ORDER BY rowid`;
}

async function readBubbles(file: TranscriptFile): Promise<Record<string, unknown>[]> {
  const composerId = file.sourceId ?? file.sessionId;
  const rows = await query(file.path, bubbleSql(composerId));
  if (!rows) return [];
  return rows
    .map((row) => parsedRecord(row.value))
    .filter((record) => Object.keys(record).length > 0)
    .sort((left, right) => (timestamp(left.createdAt) ?? 0) - (timestamp(right.createdAt) ?? 0));
}

function addUsage(
  record: Record<string, unknown>,
  timezone: string,
  usage: Map<string, ProviderUsageDay>,
): void {
  const when = timestamp(record.createdAt);
  if (when === null) return;
  const tokens = tokenCount(record);
  const inputTokens = numberValue(tokens.inputTokens);
  const outputTokens = numberValue(tokens.outputTokens);
  const cacheReadTokens = numberValue(tokens.cacheReadTokens);
  const cacheCreationTokens = numberValue(tokens.cacheCreationTokens);
  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens <= 0) return;
  const model = modelName(record);
  const date = dateForTimeZone(new Date(when), timezone);
  const key = `${date}\0${model}`;
  const current = usage.get(key) ?? {
    date,
    model,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  current.inputTokens += inputTokens;
  current.outputTokens += outputTokens;
  current.cacheReadTokens += cacheReadTokens;
  current.cacheCreationTokens += cacheCreationTokens;
  usage.set(key, current);
}

export const cursorAdapter: ProviderAdapter = {
  id: "cursor",

  root(): string {
    return process.env.OBOL_CURSOR_ROOT || CURSOR_ROOT;
  },

  async discover(root: string, sinceMs: number): Promise<TranscriptFile[]> {
    const database = join(root, DATABASE);
    const rows = await query(
      immutableDatabase(database),
      `SELECT composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, value ` +
        `FROM composerHeaders WHERE isArchived = 0 AND lastUpdatedAt >= ${Math.max(0, Math.floor(sinceMs))} ` +
        `ORDER BY lastUpdatedAt`,
    );
    if (!rows) return [];

    const parentById = new Map<string, string>();
    for (const row of rows) {
      const id = stringValue(row.composerId).trim();
      const parent = parentComposerId(row);
      if (id && parent) parentById.set(id, parent);
    }

    return rows.flatMap((row) => {
      const ids = composerIdsFor(row, parentById);
      if (!ids) return [];
      return [
        {
          path: database,
          sessionId: ids.root,
          sourceId: ids.id,
          projectDir: projectDir(row.workspaceId),
          isSubagent: ids.id !== ids.root || numberValue(row.isSubagent) === 1,
        },
      ];
    });
  },

  async *read(file: TranscriptFile): AsyncIterable<Record<string, unknown>> {
    for (const record of await readBubbles({ ...file, path: immutableDatabase(file.path) })) yield record;
  },

  timestampOf(record): number | null {
    const value = timestamp(record.createdAt);
    return value !== null && Number.isFinite(value) ? value : null;
  },

  consume(record, session): void {
    const type = numberValue(record.type);
    if (type === 2) session.assistantTurns += 1;
    if (type === 1) addPrompt(session, promptText(record.text));
    session.outputTokens += numberValue(tokenCount(record).outputTokens);
    const model = modelName(record);
    if (model !== "unknown") session.models.add(model);
  },

  async usage(root: string, sinceMs: number, timezone: string): Promise<ProviderUsageDay[]> {
    const files = await this.discover(root, sinceMs);
    const usage = new Map<string, ProviderUsageDay>();
    for (const file of files) {
      for (const record of await readBubbles({ ...file, path: immutableDatabase(file.path) })) {
        const when = this.timestampOf(record);
        if (when === null || when < sinceMs) continue;
        addUsage(record, timezone, usage);
      }
    }
    return [...usage.values()].sort(
      (left, right) => left.date.localeCompare(right.date) || left.model.localeCompare(right.model),
    );
  },
};
