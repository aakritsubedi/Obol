import { homedir } from "node:os";
import { join } from "node:path";
import { splitCachedPrompt } from "../domain/prompt-cache.js";
import { dateForTimeZone } from "../domain/time.js";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";
import { query, type SqlRow } from "./shared/sqlite.js";
import { projectForWorkspaceId } from "./shared/workspace.js";
import {
  addPrompt,
  type ProviderAdapter,
  type ProviderUsageDay,
  promptText,
  type TranscriptFile,
} from "./types.js";

const DATABASE = "state.vscdb";
const CURSOR_ROOT = join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage");
// Composers live in globalStorage; the workspace ids they carry are described
// one directory over, the same layout VS Code uses.
const WORKSPACE_STORAGE = join("..", "workspaceStorage");

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

const UNKNOWN_MODEL = "unknown";

function modelName(record: Record<string, unknown>): string {
  return stringValue(parsedRecord(record.modelInfo).modelName).trim() || UNKNOWN_MODEL;
}

function tokenCount(record: Record<string, unknown>): Record<string, unknown> {
  return parsedRecord(record.tokenCount);
}

// One pass yields the composer's own header and its bubbles. The header holds
// the name Cursor shows for the conversation, which is a far better session
// title than the first prompt, and it is ordered first so the title is known
// before any bubble is read.
function recordsSql(composerId: string): string {
  const quoted = sqlLiteral(composerId);
  const prefix = sqlLiteral(`bubbleId:${composerId}:`);
  return (
    `SELECT 0 AS ord, 'header' AS kind, value AS data FROM composerHeaders ` +
    `WHERE composerId = '${quoted}' ` +
    `UNION ALL ` +
    `SELECT 1, 'composer', value FROM cursorDiskKV WHERE key = 'composerData:${quoted}' ` +
    `UNION ALL ` +
    `SELECT 2, 'bubble', value FROM cursorDiskKV WHERE key LIKE '${prefix}%' ` +
    `ORDER BY ord`
  );
}

async function readRecords(file: TranscriptFile): Promise<Record<string, unknown>[]> {
  const composerId = file.sourceId ?? file.sessionId;
  const rows = await query(file.path, recordsSql(composerId));
  if (!rows) return [];

  const leading: Record<string, unknown>[] = [];
  const bubbles: Record<string, unknown>[] = [];
  for (const row of rows) {
    const record = parsedRecord(row.data);
    if (Object.keys(record).length === 0) continue;
    const kind = stringValue(row.kind);
    if (kind === "bubble") bubbles.push({ ...record, kind });
    else leading.push({ ...record, kind });
  }

  bubbles.sort((left, right) => (timestamp(left.createdAt) ?? 0) - (timestamp(right.createdAt) ?? 0));
  return [...leading, ...bubbles];
}

// Categories that describe the harness rather than the conversation. Their
// total is re-sent verbatim on every turn, which is what makes it a cache read
// rather than fresh input.
const OVERHEAD_CATEGORIES = new Set(["system_prompt", "tools", "rules", "skills", "mcp", "subagents"]);

interface ContextShape {
  /** Harness tokens re-sent every turn: system prompt, tools, rules, skills. */
  overhead: number;
  /** Conversation tokens as of the last turn. */
  conversation: number;
}

function contextShape(record: Record<string, unknown>): ContextShape | null {
  const breakdown = parsedRecord(record.promptTokenBreakdown);
  const categories = Array.isArray(breakdown.categories) ? breakdown.categories : [];
  if (categories.length === 0) return null;

  let overhead = 0;
  let conversation = 0;
  for (const value of categories) {
    const category = asRecord(value);
    const tokens = numberValue(category.estimatedTokens);
    if (OVERHEAD_CATEGORIES.has(stringValue(category.id))) overhead += tokens;
    else conversation += tokens;
  }
  return { overhead, conversation };
}

// Roughly four characters to a token — the usual rule of thumb, and the only
// measure available since Cursor records no output count of its own.
const CHARS_PER_TOKEN = 4;

function outputTokens(record: Record<string, unknown>): number {
  const thinking = parsedRecord(record.thinking);
  const text = stringValue(record.text).length + stringValue(thinking.text).length;
  return Math.ceil(text / CHARS_PER_TOKEN);
}

// Cursor leaves the `tokenCount` on every bubble at zero, so there is no usage
// to read directly. What it does record, per conversation, is the shape of the
// context: how many tokens the harness occupies (system prompt, tools, rules)
// and how large the conversation had grown. Since every turn re-sends the whole
// context, that shape plus the turn times reconstructs what was sent.
//
// Exact from Cursor: the overhead, the conversation's final size, the number of
// turns, and each turn's text. Modelled: the conversation grew evenly across
// those turns, and four characters make a token.
//
// What a turn re-sends is served from cache, so each turn's prompt is split
// against the one before it: the prefix prices as a cache read and only the
// growth as input. Charging the whole re-sent prompt as input — which is what
// this did before, for everything but the harness overhead — overstated a long
// conversation several times over, since the part that repeats is the part that
// is nearly free.
interface DayUsage {
  models: Map<string, ProviderUsageDay>;
  seenModel: string;
  active: boolean;
}

function dayFor(days: Map<string, DayUsage>, date: string): DayUsage {
  const day = days.get(date) ?? { models: new Map(), seenModel: "", active: false };
  day.active = true;
  days.set(date, day);
  return day;
}

function modelUsage(day: DayUsage, date: string, model: string): ProviderUsageDay {
  const current = day.models.get(model) ?? {
    date,
    model,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  day.models.set(model, current);
  return current;
}

function addRecorded(record: Record<string, unknown>, timezone: string, days: Map<string, DayUsage>): void {
  const when = timestamp(record.createdAt);
  if (when === null) return;
  const date = dateForTimeZone(new Date(when), timezone);
  const day = dayFor(days, date);
  const model = modelName(record);
  if (!day.seenModel && model !== UNKNOWN_MODEL) day.seenModel = model;

  const tokens = tokenCount(record);
  const inputTokens = numberValue(tokens.inputTokens);
  const outputTokens = numberValue(tokens.outputTokens);
  const cacheReadTokens = numberValue(tokens.cacheReadTokens);
  const cacheCreationTokens = numberValue(tokens.cacheCreationTokens);
  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens <= 0) return;

  const current = modelUsage(day, date, model);
  current.inputTokens += inputTokens;
  current.outputTokens += outputTokens;
  current.cacheReadTokens += cacheReadTokens;
  current.cacheCreationTokens += cacheCreationTokens;
}

/** Reconstructs a conversation's usage from its context shape and its turns. */
function addModelled(
  shape: ContextShape,
  turns: Record<string, unknown>[],
  fallbackModel: string,
  timezone: string,
  days: Map<string, DayUsage>,
): void {
  const total = turns.length;
  if (total === 0) return;

  turns.forEach((turn, index) => {
    const when = timestamp(turn.createdAt);
    if (when === null) return;
    const date = dateForTimeZone(new Date(when), timezone);
    const day = dayFor(days, date);
    const model = modelName(turn) !== UNKNOWN_MODEL ? modelName(turn) : fallbackModel;
    if (!day.seenModel && model !== UNKNOWN_MODEL) day.seenModel = model;
    const current = modelUsage(day, date, model);

    // The whole prompt goes out again each turn: the harness prefix, which is
    // byte-identical every time, and the conversation as it stood. Both were
    // sent last turn too, so both come back from cache.
    const prompt = shape.overhead + Math.round((shape.conversation * (index + 1)) / total);
    const previous = index === 0 ? 0 : shape.overhead + Math.round((shape.conversation * index) / total);
    const split = splitCachedPrompt(prompt, previous);
    current.inputTokens += split.inputTokens;
    current.cacheReadTokens += split.cacheReadTokens;
    current.cacheCreationTokens += split.cacheCreationTokens;
    current.outputTokens += outputTokens(turn);
  });
}

function usageRows(days: Map<string, DayUsage>): ProviderUsageDay[] {
  const rows: ProviderUsageDay[] = [];
  for (const [date, day] of days) {
    if (day.models.size > 0) {
      const grouped = new Map<string, ProviderUsageDay>();
      for (const row of day.models.values()) {
        // Cursor sometimes omits modelInfo on a bubble even though another
        // bubble that day identifies the Composer model. Keep those tokens in
        // the known model's bucket instead of creating a permanently unpriced
        // `unknown` row beside it.
        const model = row.model === UNKNOWN_MODEL ? day.seenModel || row.model : row.model;
        const current = grouped.get(model) ?? {
          date,
          model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        };
        current.inputTokens += row.inputTokens;
        current.outputTokens += row.outputTokens;
        current.cacheReadTokens += row.cacheReadTokens;
        current.cacheCreationTokens += row.cacheCreationTokens;
        grouped.set(model, current);
      }
      rows.push(...grouped.values());
      continue;
    }
    if (!day.active) continue;
    rows.push({
      date,
      model: day.seenModel || UNKNOWN_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  }
  return rows.sort(
    (left, right) => left.date.localeCompare(right.date) || left.model.localeCompare(right.model),
  );
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
      // Cursor leaves `lastUpdatedAt` null until a composer is revisited, and a
      // null never satisfies a comparison, so a conversation started in this
      // window would be dropped for having been used exactly once. `createdAt`
      // is always stamped, so it stands in whenever the update time is missing.
      `SELECT composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, value ` +
        `FROM composerHeaders ` +
        `WHERE COALESCE(isArchived, 0) = 0 ` +
        `AND COALESCE(lastUpdatedAt, createdAt, 0) >= ${Math.max(0, Math.floor(sinceMs))} ` +
        `ORDER BY COALESCE(lastUpdatedAt, createdAt, 0)`,
    );
    if (!rows) return [];

    const parentById = new Map<string, string>();
    for (const row of rows) {
      const id = stringValue(row.composerId).trim();
      const parent = parentComposerId(row);
      if (id && parent) parentById.set(id, parent);
    }

    const storageRoot = join(root, WORKSPACE_STORAGE);
    const files: TranscriptFile[] = [];
    for (const row of rows) {
      const ids = composerIdsFor(row, parentById);
      if (!ids) continue;
      files.push({
        path: database,
        sessionId: ids.root,
        sourceId: ids.id,
        projectDir: await projectForWorkspaceId(storageRoot, row.workspaceId),
        isSubagent: ids.id !== ids.root || numberValue(row.isSubagent) === 1,
      });
    }
    return files;
  },

  async *read(file: TranscriptFile): AsyncIterable<Record<string, unknown>> {
    for (const record of await readRecords({ ...file, path: immutableDatabase(file.path) })) yield record;
  },

  // Cursor names each conversation; that name is the session's title. The
  // header carries no event time, so it is read here rather than in consume.
  meta(record, session): void {
    if (stringValue(record.kind) !== "header") return;
    const name = stringValue(record.name).trim();
    if (name) session.title = name;
  },

  timestampOf(record): number | null {
    // The header describes the conversation rather than recording an event, and
    // it carries the composer's creation time — counting that as activity would
    // stretch a session back to whenever it was first opened.
    if (stringValue(record.kind) === "header") return null;
    const value = timestamp(record.createdAt);
    return value !== null && Number.isFinite(value) ? value : null;
  },

  consume(record, session): void {
    const type = numberValue(record.type);
    if (type === 2) session.assistantTurns += 1;
    if (type === 1) addPrompt(session, promptText(record.text));
    session.outputTokens += numberValue(tokenCount(record).outputTokens);
    const model = modelName(record);
    if (model !== UNKNOWN_MODEL) session.models.add(model);
  },

  async usage(root: string, sinceMs: number, timezone: string): Promise<ProviderUsageDay[]> {
    const files = await this.discover(root, sinceMs);
    const days = new Map<string, DayUsage>();
    for (const file of files) {
      const records = await readRecords({ ...file, path: immutableDatabase(file.path) });
      const shape = records.map(contextShape).find((value): value is ContextShape => value !== null);
      const bubbles = records.filter((record) => stringValue(record.kind) === "bubble");
      const inWindow = bubbles.filter((record) => (timestamp(record.createdAt) ?? 0) >= sinceMs);

      // A conversation Cursor did count is reported as counted; the rest is
      // reconstructed from its context shape. Never both, or the turns that
      // carry real numbers would be paid for twice.
      const recorded = bubbles.some((record) => {
        const tokens = tokenCount(record);
        return (
          numberValue(tokens.inputTokens) +
            numberValue(tokens.outputTokens) +
            numberValue(tokens.cacheReadTokens) +
            numberValue(tokens.cacheCreationTokens) >
          0
        );
      });

      if (recorded || !shape) {
        for (const record of inWindow) addRecorded(record, timezone, days);
        continue;
      }

      // Turn indices come from the whole conversation so a turn's share of the
      // context does not jump when only part of it falls inside the window.
      const answers = bubbles.filter((record) => numberValue(record.type) === 2);
      const visible = new Set(inWindow);
      const model = bubbles.map(modelName).find((name) => name !== UNKNOWN_MODEL) ?? UNKNOWN_MODEL;
      addModelled(
        shape,
        answers.map((turn) => (visible.has(turn) ? turn : { ...turn, createdAt: null })),
        model,
        timezone,
        days,
      );
      for (const record of inWindow.filter((record) => numberValue(record.type) !== 2)) {
        dayFor(days, dateForTimeZone(new Date(timestamp(record.createdAt) ?? 0), timezone));
      }
    }
    return usageRows(days);
  },
};
