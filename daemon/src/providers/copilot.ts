import { type Dirent, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { splitCachedPrompt } from "../domain/prompt-cache.js";
import { dateForTimeZone } from "../domain/time.js";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";
import { keepRecent } from "./claude.js";
import { readPatchLog } from "./shared/patch-log.js";
import { workspaceProject } from "./shared/workspace.js";
import {
  addPrompt,
  countTool,
  type ProviderAdapter,
  type ProviderUsageDay,
  promptText,
  recordFile,
  TEST_COMMAND,
  type TranscriptFile,
} from "./types.js";

const CODE_ROOT = join(homedir(), "Library", "Application Support", "Code", "User", "workspaceStorage");
const INSIDERS_ROOT = join(
  homedir(),
  "Library",
  "Application Support",
  "Code - Insiders",
  "User",
  "workspaceStorage",
);
// Copilot names a tool once per call, so an exact set is enough — the same rule
// claude.ts and opencode.ts follow. Matching loosely would count `read_file`
// and `list_files` as edits and make the file counts incomparable across agents.
const EDIT_TOOLS = new Set([
  "edit",
  "write",
  "edit_file",
  "write_file",
  "create_file",
  "apply_patch",
  "insert_edit_into_file",
  "replace_string_in_file",
  "multi_replace_string_in_file",
  "edit_notebook_file",
]);

function roots(): string[] {
  return [CODE_ROOT, INSIDERS_ROOT];
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const numeric = numberValue(value, 0);
  return numeric > 0 ? numeric : null;
}

function requestsFrom(session: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(session.requests)) return session.requests.map(asRecord);
  const requests = asRecord(session.requests);
  return Object.keys(requests)
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => asRecord(requests[key]));
}

// `modelId` is the picker's entry, not the model that answered: under Copilot's
// default routing it reads `copilot/auto`, which prices at nothing. The model
// actually used is reported on the response, and the session's selected model
// names the family behind the alias — both outrank the alias itself.
function requestModel(request: Record<string, unknown>): string {
  const response = Array.isArray(request.response) ? request.response : [];
  const resolvedModel = response
    .map((part) => stringValue(asRecord(part).resolvedModel).trim())
    .find(Boolean);
  const family = (value: unknown): string => stringValue(asRecord(asRecord(value).metadata).family).trim();
  return (
    stringValue(request.resolvedModel).trim() ||
    resolvedModel ||
    family(request.selectedModel) ||
    family(request.sessionSelectedModel) ||
    stringValue(request.modelId).trim()
  );
}

function requestPrompt(request: Record<string, unknown>): string {
  const message = request.message;
  if (typeof message === "string" || Array.isArray(message)) return promptText(message);
  const messageRecord = asRecord(message);
  return promptText(
    messageRecord.text ?? messageRecord.content ?? messageRecord.parts ?? request.prompt ?? request.text,
  );
}

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

function toolCalls(value: unknown, result: ToolCall[] = []): ToolCall[] {
  if (Array.isArray(value)) {
    for (const item of value) toolCalls(item, result);
    return result;
  }
  const record = asRecord(value);
  for (const key of ["toolCalls", "calls", "tools"]) {
    if (record[key] !== undefined) toolCalls(record[key], result);
  }
  const name = stringValue(record.name ?? record.toolName ?? record.tool).trim();
  if (name) {
    const rawInput = record.input ?? record.arguments ?? record.parameters ?? record.args ?? record.toolInput;
    let input = asRecord(rawInput);
    if (typeof rawInput === "string") {
      try {
        input = asRecord(JSON.parse(rawInput));
      } catch {
        input = {};
      }
    }
    result.push({
      name,
      input,
    });
  }
  return result;
}

function consumeToolRounds(
  request: Record<string, unknown>,
  session: Parameters<ProviderAdapter["consume"]>[1],
  day: Parameters<ProviderAdapter["consume"]>[2],
): void {
  const metadata = asRecord(request.metadata);
  const result = asRecord(request.result);
  const resultMetadata = asRecord(result.metadata);
  const rounds = metadata.toolCallRounds ?? resultMetadata.toolCallRounds;
  for (const call of toolCalls(rounds)) {
    const normalized = call.name.toLowerCase();
    countTool(session, day, call.name);
    if (EDIT_TOOLS.has(normalized)) {
      recordFile(
        session,
        day,
        stringValue(call.input.filePath ?? call.input.file_path ?? call.input.path ?? call.input.targetFile),
      );
    }
    const command = stringValue(call.input.command ?? call.input.shellCommand ?? call.input.cmd);
    if (TEST_COMMAND.test(command)) day.testRuns += 1;
  }
}

// Copilot writes a turn's token counts to the request itself on some builds and
// only to the result's metadata on others — the two are mixed within a single
// machine's history, so a reader of just one drops half the traffic.
function promptTokensOf(request: Record<string, unknown>): number {
  const metadata = asRecord(asRecord(request.result).metadata);
  return numberValue(request.promptTokens) || numberValue(metadata.promptTokens);
}

function completionTokensOf(request: Record<string, unknown>): number {
  const metadata = asRecord(asRecord(request.result).metadata);
  return (
    numberValue(request.completionTokens) ||
    numberValue(metadata.completionTokens) ||
    numberValue(metadata.outputTokens)
  );
}

function usageFromRequest(
  request: Record<string, unknown>,
  previousPromptTokens: number,
  timezone: string,
  usage: Map<string, ProviderUsageDay>,
): void {
  const timestamp = parseTimestamp(request.timestamp) ?? parseTimestamp(request.creationDate);
  if (timestamp === null) return;
  const promptTokens = promptTokensOf(request);
  const outputTokens = completionTokensOf(request);
  const recordedRead = numberValue(request.cacheReadTokens);
  const recordedCreation = numberValue(request.cacheCreationTokens);
  // `promptTokens` is the whole prompt for the turn, re-sent prefix included,
  // and Copilot records no cache split of its own. Honour one if a build ever
  // starts reporting it; otherwise derive it from how far the prompt grew since
  // the previous turn of this session, so the repeated part prices as the cache
  // read it is rather than as fresh input.
  const split =
    recordedRead + recordedCreation > 0
      ? {
          inputTokens: promptTokens,
          cacheReadTokens: recordedRead,
          cacheCreationTokens: recordedCreation,
        }
      : splitCachedPrompt(promptTokens, previousPromptTokens);
  const { inputTokens, cacheReadTokens, cacheCreationTokens } = split;
  const credits = numberValue(
    request.copilotCredits ?? request.credits ?? asRecord(request.metadata).copilotCredits,
  );
  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens <= 0 && credits <= 0) return;
  const model = requestModel(request) || "unknown";
  const date = dateForTimeZone(new Date(timestamp), timezone);
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
  if (credits > 0) current.credits = (current.credits ?? 0) + credits;
  usage.set(key, current);
}

export const copilotAdapter: ProviderAdapter = {
  id: "copilot",

  root(): string {
    if (process.env.OBOL_COPILOT_ROOT) return process.env.OBOL_COPILOT_ROOT;
    return roots().find((path) => existsSync(path)) ?? CODE_ROOT;
  },

  // Reads the root it is handed and nothing else, so pointing the adapter
  // somewhere else moves it wholesale — `root()` is what chooses between a
  // stable VS Code install and Insiders.
  async discover(root: string, sinceMs: number): Promise<TranscriptFile[]> {
    let workspaces: Dirent[];
    try {
      workspaces = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: TranscriptFile[] = [];
    for (const workspace of workspaces) {
      if (!workspace.isDirectory()) continue;
      const workspacePath = join(root, workspace.name);
      const chatRoot = join(workspacePath, "chatSessions");
      let sessions: Dirent[];
      try {
        sessions = await readdir(chatRoot, { withFileTypes: true });
      } catch {
        // A workspace the person never opened a chat in.
        continue;
      }
      const projectDir = await workspaceProject(workspacePath);
      for (const session of sessions) {
        if (!session.isFile() || !session.name.endsWith(".jsonl")) continue;
        files.push({
          path: join(chatRoot, session.name),
          sessionId: basename(session.name, ".jsonl"),
          projectDir,
          isSubagent: false,
        });
      }
    }
    return keepRecent(files, sinceMs);
  },

  async *read(file: TranscriptFile): AsyncIterable<Record<string, unknown>> {
    const session = await readPatchLog(file.path);
    for (const [requestIndex, request] of requestsFrom(session).entries()) {
      yield {
        ...request,
        requestIndex,
        creationDate: session.creationDate,
        sessionId: session.sessionId,
        // The picked model lives on the session, not the turn; carry it along
        // so a turn can name the family behind a `copilot/auto` alias.
        sessionSelectedModel: asRecord(session.inputState).selectedModel,
      };
    }
  },

  timestampOf(record): number | null {
    return parseTimestamp(record.timestamp) ?? parseTimestamp(record.creationDate);
  },

  consume(record, session, day): void {
    session.assistantTurns += 1;
    session.outputTokens += completionTokensOf(record);
    const model = requestModel(record);
    if (model) session.models.add(model);
    addPrompt(session, requestPrompt(record));
    consumeToolRounds(record, session, day);
  },

  async usage(root: string, sinceMs: number, timezone: string): Promise<ProviderUsageDay[]> {
    const files = await this.discover(root, sinceMs);
    const usage = new Map<string, ProviderUsageDay>();
    for (const file of files) {
      // Carried across the whole session, not just its in-window turns: a
      // session that began before the window still had its prefix cached, and
      // restating it as fresh input would bill the window's first turn for the
      // entire conversation that led up to it.
      let previousPromptTokens = 0;
      for await (const record of this.read?.(file) ?? []) {
        const timestamp = parseTimestamp(record.timestamp) ?? parseTimestamp(record.creationDate);
        if (timestamp !== null && timestamp >= sinceMs) {
          usageFromRequest(record, previousPromptTokens, timezone, usage);
        }
        const promptTokens = promptTokensOf(record);
        if (promptTokens > 0) previousPromptTokens = promptTokens;
      }
    }
    return [...usage.values()].sort(
      (left, right) => left.date.localeCompare(right.date) || left.model.localeCompare(right.model),
    );
  },
};
