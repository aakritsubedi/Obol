import { asRecord, stringValue } from "../shared/coerce.js";

export const MAX_PROMPTS_PER_SESSION = 6;
const MAX_PROMPT_LENGTH = 180;

export const TEST_COMMAND =
  /\b(?:npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|vitest|jest|pytest|go\s+test|cargo\s+test)\b/;

// One transcript on disk. `sessionId` groups files that belong to the same
// conversation — a Claude subagent transcript carries its parent's id so its
// work is attributed there rather than surfacing as a session of its own.
export interface TranscriptFile {
  path: string;
  sessionId: string;
  // The provider's own name for the project, used to join against ccusage.
  projectDir: string;
  isSubagent: boolean;
  // Some providers use one logical session id for several physical sources.
  // When present, adapters use this to identify the source record while the
  // journal still folds it into `sessionId`.
  sourceId?: string;
}

export interface ProviderUsageDay {
  /** YYYY-MM-DD in the requested timezone. */
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Copilot premium-request credits, when the source records them. */
  credits?: number;
}

export interface SessionAccumulator {
  id: string;
  provider: string;
  title: string | null;
  projectDir: string;
  projectPath: string;
  gitBranch: string | null;
  timestamps: number[];
  humanPrompts: number;
  assistantTurns: number;
  toolCalls: number;
  outputTokens: number;
  filesEdited: Set<string>;
  models: Set<string>;
  prompts: string[];
  toolMix: Map<string, number>;
}

export function emptySession(id: string, provider: string, projectDir: string): SessionAccumulator {
  return {
    id,
    provider,
    title: null,
    projectDir,
    projectPath: "",
    gitBranch: null,
    timestamps: [],
    humanPrompts: 0,
    assistantTurns: 0,
    toolCalls: 0,
    outputTokens: 0,
    filesEdited: new Set(),
    models: new Set(),
    prompts: [],
    toolMix: new Map(),
  };
}

// Totals that belong to the day rather than to any one session.
export interface DayCounters {
  testRuns: number;
  filesEdited: Set<string>;
  toolMix: Map<string, number>;
}

export function emptyDay(): DayCounters {
  return { testRuns: 0, filesEdited: new Set(), toolMix: new Map() };
}

function addCounts(into: Map<string, number>, from: Map<string, number>): void {
  for (const [key, count] of from) into.set(key, (into.get(key) ?? 0) + count);
}

/**
 * Folds one transcript's totals into the session it belongs to.
 *
 * Accumulation is additive, so a session can be built a file at a time and
 * merged rather than read in one pass. That is what lets a scan resume from
 * where it stopped: a file's own totals are cached, and only its new records
 * are read before merging again. Callers must merge in discovery order, which
 * is what keeps the fields that are not sums — the title, the first cwd, the
 * kept prompts — resolving the way a single pass resolves them.
 */
export function mergeSessionInto(into: SessionAccumulator, from: SessionAccumulator): void {
  // Last one wins, as in a single pass: a later file's title supersedes.
  if (from.title) into.title = from.title;
  // First one wins: the directory a session opened in, never a later subdirectory.
  if (!into.projectPath && from.projectPath) into.projectPath = from.projectPath;
  if (from.gitBranch) into.gitBranch = from.gitBranch;
  into.timestamps.push(...from.timestamps);
  into.humanPrompts += from.humanPrompts;
  into.assistantTurns += from.assistantTurns;
  into.toolCalls += from.toolCalls;
  into.outputTokens += from.outputTokens;
  for (const file of from.filesEdited) into.filesEdited.add(file);
  for (const model of from.models) into.models.add(model);
  addCounts(into.toolMix, from.toolMix);
  // The same cap and de-duplication a single pass applies, so a session spread
  // over several transcripts keeps the first prompts rather than the last.
  for (const prompt of from.prompts) {
    if (into.prompts.length >= MAX_PROMPTS_PER_SESSION) break;
    if (!into.prompts.includes(prompt)) into.prompts.push(prompt);
  }
}

export function mergeDayInto(into: DayCounters, from: DayCounters): void {
  into.testRuns += from.testRuns;
  for (const file of from.filesEdited) into.filesEdited.add(file);
  addCounts(into.toolMix, from.toolMix);
}

export function countTool(session: SessionAccumulator, day: DayCounters, name: string): void {
  session.toolCalls += 1;
  session.toolMix.set(name, (session.toolMix.get(name) ?? 0) + 1);
  day.toolMix.set(name, (day.toolMix.get(name) ?? 0) + 1);
}

export function recordFile(session: SessionAccumulator, day: DayCounters, path: string): void {
  const trimmed = path.trim();
  if (!trimmed) return;
  session.filesEdited.add(trimmed);
  day.filesEdited.add(trimmed);
}

export function addPrompt(session: SessionAccumulator, text: string): void {
  if (!text) return;
  session.humanPrompts += 1;
  // An agent can replay the same instruction across several turns. Repeating it
  // in the task list says nothing new, so only the first occurrence is kept —
  // the count still reflects every prompt.
  if (session.prompts.length < MAX_PROMPTS_PER_SESSION && !session.prompts.includes(text)) {
    session.prompts.push(text);
  }
}

// Agents inject context into a prompt as XML-ish blocks — <ide_selection> and
// <ide_opened_file> from Claude's editor, <recommended_plugins> and
// <codex_delegation> from Codex. They surround the text the person actually
// typed, so they are stripped before anything is kept. A record with nothing
// left afterwards was never a real instruction.
export function promptText(content: unknown): string {
  const raw =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => {
              const block = asRecord(part);
              return block.type === "text" || block.type === "input_text" ? stringValue(block.text) : "";
            })
            .join("\n")
        : "";

  const stripped = raw
    .replace(/<([a-zA-Z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<\/?[a-zA-Z][\w-]*\b[^>]*>/g, " ");

  const lines = stripped
    .split("\n")
    .map((value) => decodeEntities(value).trim())
    .filter((value) => value.length > 0);

  // Codex wraps a prompt in a markdown template — "## My request:", "# Files
  // mentioned by the user:". Those headers are scaffolding, so the first line
  // of actual prose is the one worth keeping. If a record is nothing but
  // scaffolding, fall back to it rather than dropping the prompt entirely.
  const prose = lines.find((value) => !SCAFFOLD.test(value));
  const line = prose ?? lines[0];
  if (!line) return "";
  return line.length > MAX_PROMPT_LENGTH ? `${line.slice(0, MAX_PROMPT_LENGTH - 1).trimEnd()}…` : line;
}

// A markdown heading, or a short line that is only a label ending in a colon.
const SCAFFOLD = /^#{1,6}\s|^[^.?!]{0,48}:$/;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x20;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

// Each agent writes its own transcript format, so reading a day means asking
// every installed provider the same three questions: which files might hold
// today's records, when did a record happen, and what does it mean.
export interface ProviderAdapter {
  /** Stable id, and the key ccusage uses for this agent. */
  id: string;
  /** Where this provider keeps its transcripts. */
  root(): string;
  /** Transcripts touched since `sinceMs`, cheap enough to run on every request. */
  discover(root: string, sinceMs: number): Promise<TranscriptFile[]>;
  /**
   * Yields a transcript's records from whatever stores them. Defaults to
   * reading the file as newline-delimited JSON; an agent that keeps its
   * history elsewhere (OpenCode holds sessions in SQLite) overrides this and
   * `path` becomes whatever its query needs instead of a real file.
   */
  read?(file: TranscriptFile): AsyncIterable<Record<string, unknown>>;
  /** Epoch ms for a record, or null when it carries no time of its own. */
  timestampOf(record: Record<string, unknown>): number | null;
  /**
   * Called for every record, in file order, before the day filter — for data
   * that carries no timestamp, such as a session title or its working
   * directory. Must not touch counters.
   */
  meta?(record: Record<string, unknown>, session: SessionAccumulator, file: TranscriptFile): void;
  /** Called only for records that fall on the day being read. */
  consume(
    record: Record<string, unknown>,
    session: SessionAccumulator,
    day: DayCounters,
    file: TranscriptFile,
  ): void;
  /** Token usage recorded locally, for agents ccusage cannot report. */
  usage?(root: string, sinceMs: number, timezone: string): Promise<ProviderUsageDay[]>;
}
