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

// Cursor stamps the live context size onto the user bubble that opens a turn:
// `contextWindowStatusAtCreation.tokensUsed` is the whole prompt that turn sent,
// harness and conversation together. That value is written once and never
// rewritten, which is what makes it usable as history — unlike the
// conversation-level `promptTokenBreakdown`, which is a single snapshot of the
// context as it stands *now* and therefore shrinks every time Cursor compacts.
function anchorTokens(record: Record<string, unknown>): number | null {
  const used = numberValue(parsedRecord(record.contextWindowStatusAtCreation).tokensUsed);
  return used > 0 ? Math.round(used) : null;
}

// The composer's current context size, used as a trailing anchor for turns
// Cursor did not stamp. `totalUsedTokens` is the figure Cursor itself shows;
// older builds only wrote the categories it is the sum of.
function finalContextTokens(record: Record<string, unknown>): number | null {
  const breakdown = parsedRecord(record.promptTokenBreakdown);
  const total = numberValue(breakdown.totalUsedTokens);
  if (total > 0) return Math.round(total);
  const categories = Array.isArray(breakdown.categories) ? breakdown.categories : [];
  if (categories.length === 0) return null;
  const sum = categories.reduce(
    (running, value) => running + numberValue(asRecord(value).estimatedTokens),
    0,
  );
  return sum > 0 ? Math.round(sum) : null;
}

// Roughly four characters to a token — the usual rule of thumb, and the only
// measure available since Cursor records no output count of its own.
const CHARS_PER_TOKEN = 4;

// What the model generated, and only that. Tool *results* are deliberately not
// counted here: they are text the model read, not text it wrote, and charging
// them at the output rate priced a file read like a page of generated code.
// They are already paid for as context growth, which is where they belong.
function outputCharacterCount(record: Record<string, unknown>): number {
  const thinking = parsedRecord(record.thinking);
  let chars = stringValue(record.text).length + stringValue(thinking.text).length;
  for (const value of Array.isArray(record.codeBlocks) ? record.codeBlocks : []) {
    const block = asRecord(value);
    chars += stringValue(block.content ?? block.code ?? block.text).length;
  }
  for (const value of Array.isArray(record.allThinkingBlocks) ? record.allThinkingBlocks : []) {
    const block = asRecord(value);
    chars += stringValue(block.text ?? block.content).length;
  }
  return chars;
}

function outputTokens(record: Record<string, unknown>): number {
  return Math.ceil(outputCharacterCount(record) / CHARS_PER_TOKEN);
}

interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

function recordedTokens(record: Record<string, unknown>): TokenTotals {
  const tokens = tokenCount(record);
  return {
    inputTokens: numberValue(tokens.inputTokens),
    outputTokens: numberValue(tokens.outputTokens),
    cacheReadTokens: numberValue(tokens.cacheReadTokens),
    cacheCreationTokens: numberValue(tokens.cacheCreationTokens),
  };
}

function totalOf(tokens: TokenTotals): number {
  return tokens.inputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheCreationTokens;
}

/**
 * One exchange: the user's message and every bubble the agent produced before
 * the next one. Cursor writes a bubble per thinking block, per text chunk and
 * per tool call, so a bubble is not a model call — but a tool call always is,
 * because its result has to go back for the model to act on. A turn therefore
 * costs one model call per tool call, plus the one that ends it.
 */
interface Turn {
  at: number;
  model: string;
  anchor: number | null;
  calls: number;
  output: number;
  recorded: TokenTotals;
}

function emptyTotals(): TokenTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
}

function turnsOf(bubbles: Record<string, unknown>[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const record of bubbles) {
    const when = timestamp(record.createdAt);
    if (when === null) continue;
    // A prompt opens a turn. Anything before the first one — a resumed
    // conversation whose opening prompt Cursor no longer holds — opens its own.
    if (numberValue(record.type) === 1 || current === null) {
      current = {
        at: when,
        model: UNKNOWN_MODEL,
        anchor: null,
        calls: 1,
        output: 0,
        recorded: emptyTotals(),
      };
      turns.push(current);
    }

    if (current.model === UNKNOWN_MODEL) current.model = modelName(record);
    if (current.anchor === null) current.anchor = anchorTokens(record);
    // The prompt itself generates nothing; only the agent's bubbles do.
    if (numberValue(record.type) !== 1) current.output += outputTokens(record);
    if (Object.keys(parsedRecord(record.toolFormerData)).length > 0) current.calls += 1;

    const tokens = recordedTokens(record);
    current.recorded.inputTokens += tokens.inputTokens;
    current.recorded.outputTokens += tokens.outputTokens;
    current.recorded.cacheReadTokens += tokens.cacheReadTokens;
    current.recorded.cacheCreationTokens += tokens.cacheCreationTokens;
  }
  return turns;
}

/**
 * Fills in the turns Cursor did not stamp a context size onto, so the series is
 * complete without inventing a shape where one is known. Between two stamped
 * turns the context is interpolated; before the first it ramps up from nothing.
 * The composer's own snapshot anchors the final turn, which is the turn it
 * describes. A conversation with no stamp anywhere — anything written by a
 * Cursor build older than the field — is the one case that ramps the whole way
 * from nothing to that snapshot, which is the best it allows.
 */
function fillAnchors(turns: Turn[], finalTokens: number | null): number[] {
  const known = turns.map((turn) => turn.anchor);
  const indices = known.map((value, index) => (value === null ? -1 : index)).filter((index) => index >= 0);
  const points: Array<[number, number]> = indices.map((index) => [index, known[index] ?? 0]);

  // `promptTokenBreakdown` describes the context as of the most recent prompt,
  // so it anchors the last turn — but only when Cursor stamped nothing there
  // itself, and never below a size the conversation is already known to reach.
  const tailIndex = turns.length - 1;
  const last = indices[indices.length - 1];
  if (finalTokens !== null && known[tailIndex] === null) {
    points.push([tailIndex, Math.max(finalTokens, last === undefined ? 0 : (known[last] ?? 0))]);
  }
  if (points.length === 0) return turns.map(() => 0);

  const at = new Map(points);
  return turns.map((_turn, index) => {
    const exact = at.get(index);
    if (exact !== undefined) return exact;
    const after = points.find(([point]) => point > index);
    const earlier = points.filter(([point]) => point < index);
    const before = earlier[earlier.length - 1];
    if (!after) return before ? before[1] : 0;
    // Nothing before this turn to interpolate from: the context ramps up to the
    // first size Cursor did record, rather than starting there.
    if (!before) return Math.round((after[1] * (index + 1)) / (after[0] + 1));
    const span = after[0] - before[0];
    return Math.round(before[1] + ((after[1] - before[1]) * (index - before[0])) / span);
  });
}

interface DayUsage {
  models: Map<string, ProviderUsageDay>;
  seenModel: string;
}

function dayFor(days: Map<string, DayUsage>, date: string): DayUsage {
  const day = days.get(date) ?? { models: new Map(), seenModel: "" };
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

/**
 * Turns the per-turn context series into billable tokens.
 *
 * Every model call re-sends the whole conversation, and the provider behind
 * Cursor caches that prefix, so the repeat is a cache read rather than fresh
 * input — a tenth of the input rate. That is most of what an agent session
 * costs, and the previous model dropped it entirely on the grounds that it
 * would double-count; the effect was to price a thousand-call session as if it
 * had sent its context once, which is where the estimate lost an order of
 * magnitude. The reads are real traffic and the other adapters already report
 * them; leaving them out is what made Cursor look free beside Claude Code.
 *
 * Within a turn the context keeps growing as tool results come back, so the
 * calls after the first read somewhere between this turn's size and the next
 * one's — the midpoint stands in for that.
 */
function addTurns(
  turns: Turn[],
  anchors: number[],
  visible: boolean[],
  timezone: string,
  days: Map<string, DayUsage>,
): void {
  let previous = 0;
  turns.forEach((turn, index) => {
    const prompt = anchors[index] ?? 0;
    const next = anchors[index + 1] ?? prompt;
    // A turn Cursor counted itself is reported as counted. Deciding this per
    // turn rather than per conversation matters: the old check flipped a whole
    // conversation to "recorded" the moment any single bubble carried a number,
    // which dropped every reconstructed turn beside it and made the day's total
    // fall as the conversation grew.
    const recorded = totalOf(turn.recorded) > 0;
    // A prompt smaller than the last one means Cursor compacted the context.
    // The prefix that replaces it is a freshly built summary, so none of it can
    // come back from cache — it is written, not read.
    const compacted = prompt > 0 && prompt < previous;
    const split = splitCachedPrompt(prompt, compacted ? 0 : previous);
    // The context this turn opened at is what the next turn reads back from
    // cache; whatever the turn then grew by shows up as that turn's input.
    previous = prompt;
    if (!visible[index]) return;

    // A day Cursor worked on is reported even when nothing priced, so the day
    // reads as "never reported" rather than dropping out of history entirely.
    const date = dateForTimeZone(new Date(turn.at), timezone);
    const day = dayFor(days, date);
    if (!day.seenModel && turn.model !== UNKNOWN_MODEL) day.seenModel = turn.model;
    const current = modelUsage(day, date, turn.model);
    if (recorded) {
      current.inputTokens += turn.recorded.inputTokens;
      current.outputTokens += turn.recorded.outputTokens;
      current.cacheReadTokens += turn.recorded.cacheReadTokens;
      current.cacheCreationTokens += turn.recorded.cacheCreationTokens;
      return;
    }
    current.inputTokens += split.inputTokens;
    current.cacheReadTokens += split.cacheReadTokens;
    current.cacheCreationTokens += split.cacheCreationTokens;
    const repeats = Math.max(0, turn.calls - 1);
    current.cacheReadTokens += repeats * Math.round((prompt + Math.max(prompt, next)) / 2);
    current.outputTokens += turn.output;
  });
}

function usageRows(days: Map<string, DayUsage>): ProviderUsageDay[] {
  const rows: ProviderUsageDay[] = [];
  for (const [date, day] of days) {
    const grouped = new Map<string, ProviderUsageDay>();
    for (const row of day.models.values()) {
      // Cursor sometimes omits modelInfo on a turn even though another turn
      // that day identifies the Composer model. Keep those tokens in the known
      // model's bucket instead of creating a permanently unpriced `unknown`
      // row beside it.
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
      const bubbles = records.filter((record) => stringValue(record.kind) === "bubble");
      const turns = turnsOf(bubbles);
      if (turns.length === 0) continue;

      // The whole conversation is walked even when only its tail falls inside
      // the window, because a turn's cache split is defined against the turn
      // before it. Only the turns inside the window are reported.
      const finalTokens = records.map(finalContextTokens).find((value) => value !== null) ?? null;
      const anchors = fillAnchors(turns, finalTokens);
      const visible = turns.map((turn) => turn.at >= sinceMs);

      // A conversation can name its model on one turn and leave the rest blank;
      // Cursor writes `modelInfo` onto the prompt bubble, not the replies.
      const known = turns.map((turn) => turn.model).find((model) => model !== UNKNOWN_MODEL);
      if (known) {
        for (const turn of turns) if (turn.model === UNKNOWN_MODEL) turn.model = known;
      }

      addTurns(turns, anchors, visible, timezone, days);
    }
    return usageRows(days);
  },
};
