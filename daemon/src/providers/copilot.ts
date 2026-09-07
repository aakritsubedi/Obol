import { createReadStream, type Dirent, existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { dateForTimeZone } from "../domain/time.js";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";
import { keepRecent } from "./claude.js";
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
const EDIT_TOOLS = new Set(["edit", "write", "edit_file", "write_file", "replace_string_in_file"]);

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

function projectSlug(folder: unknown): string {
  const raw = stringValue(folder).trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "file:") return decodeURIComponent(parsed.pathname).replace(/\//g, "-");
  } catch {
    // Workspace files occasionally contain a plain path; handle it below.
  }
  return raw.replace(/^file:\/\//, "").replace(/\//g, "-");
}

async function workspaceProject(directory: string): Promise<string> {
  try {
    const workspace = asRecord(JSON.parse(await readFile(join(directory, "workspace.json"), "utf8")));
    return projectSlug(workspace.folder) || basename(directory);
  } catch {
    return basename(directory);
  }
}

function cloneValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function isObject(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function childContainer(nextKey: string | number): Record<string, unknown> | unknown[] {
  return typeof nextKey === "number" || /^\d+$/.test(String(nextKey)) ? [] : {};
}

function setPath(root: Record<string, unknown>, path: Array<string | number>, value: unknown): void {
  if (path.length === 0) return;
  let current: unknown = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const nextKey = path[index + 1];
    if (Array.isArray(current)) {
      const position = Number(key);
      if (!Number.isInteger(position) || position < 0) return;
      if (!isObject(current[position])) current[position] = childContainer(nextKey);
      current = current[position];
    } else if (isObject(current)) {
      const object = current as Record<string, unknown>;
      if (!isObject(object[String(key)]) || object[String(key)] === null) {
        object[String(key)] = childContainer(nextKey);
      }
      current = object[String(key)];
    } else {
      return;
    }
  }

  const key = path[path.length - 1];
  if (Array.isArray(current)) {
    const position = Number(key);
    if (Number.isInteger(position) && position >= 0) current[position] = value;
  } else if (isObject(current)) {
    (current as Record<string, unknown>)[String(key)] = value;
  }
}

function getPath(root: Record<string, unknown>, path: Array<string | number>): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (Array.isArray(current)) {
      const position = Number(key);
      if (!Number.isInteger(position) || position < 0) return undefined;
      current = current[position];
    } else if (isObject(current)) {
      current = (current as Record<string, unknown>)[String(key)];
    } else {
      return undefined;
    }
  }
  return current;
}

function appendPath(root: Record<string, unknown>, path: Array<string | number>, value: unknown): void {
  const current = getPath(root, path);
  if (Array.isArray(current)) {
    current.push(value);
  } else {
    setPath(root, path, [value]);
  }
}

function replayPatchLog(lines: string[]): Record<string, unknown> {
  let session: Record<string, unknown> = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    let patch: Record<string, unknown>;
    try {
      patch = asRecord(JSON.parse(line));
    } catch {
      continue;
    }
    const kind = numberValue(patch.kind, -1);
    if (kind === 0) {
      const seed = cloneValue(patch.v);
      session = asRecord(seed);
    } else if (kind === 1 || kind === 2) {
      const path = Array.isArray(patch.k)
        ? patch.k.filter((key): key is string | number => typeof key === "string" || typeof key === "number")
        : [];
      if (path.length === 0) continue;
      if (kind === 1) setPath(session, path, cloneValue(patch.v));
      else appendPath(session, path, cloneValue(patch.v));
    }
  }
  return session;
}

async function readPatchLog(path: string): Promise<Record<string, unknown>> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const values: string[] = [];
  try {
    for await (const line of lines) values.push(line);
  } finally {
    lines.close();
    stream.close();
  }
  return replayPatchLog(values);
}

function requestsFrom(session: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(session.requests)) return session.requests.map(asRecord);
  const requests = asRecord(session.requests);
  return Object.keys(requests)
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => asRecord(requests[key]));
}

function requestModel(request: Record<string, unknown>): string {
  const selectedModel = asRecord(request.selectedModel);
  const metadata = asRecord(selectedModel.metadata);
  const response = Array.isArray(request.response) ? request.response : [];
  const resolvedModel = response
    .map((part) => stringValue(asRecord(part).resolvedModel).trim())
    .find(Boolean);
  return (
    stringValue(request.resolvedModel).trim() ||
    resolvedModel ||
    stringValue(metadata.family).trim() ||
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
    if (EDIT_TOOLS.has(normalized) || /(?:edit|write|file)/.test(normalized)) {
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

function usageFromRequest(
  request: Record<string, unknown>,
  timezone: string,
  usage: Map<string, ProviderUsageDay>,
): void {
  const timestamp = parseTimestamp(request.timestamp) ?? parseTimestamp(request.creationDate);
  if (timestamp === null) return;
  const inputTokens = numberValue(request.promptTokens);
  const outputTokens = numberValue(request.completionTokens);
  const cacheReadTokens = numberValue(request.cacheReadTokens);
  const cacheCreationTokens = numberValue(request.cacheCreationTokens);
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

  async discover(root: string, sinceMs: number): Promise<TranscriptFile[]> {
    const searchRoots = process.env.OBOL_COPILOT_ROOT
      ? [root]
      : [root, ...roots().filter((candidate) => candidate !== root)];
    const files: TranscriptFile[] = [];
    for (const searchRoot of [...new Set(searchRoots)]) {
      let workspaces: Dirent[];
      try {
        workspaces = await readdir(searchRoot, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const workspace of workspaces) {
        if (!workspace.isDirectory()) continue;
        const workspacePath = join(searchRoot, workspace.name);
        const projectDir = await workspaceProject(workspacePath);
        const chatRoot = join(workspacePath, "chatSessions");
        let sessions: Dirent[];
        try {
          sessions = await readdir(chatRoot, { withFileTypes: true });
        } catch {
          continue;
        }
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
      };
    }
  },

  timestampOf(record): number | null {
    return parseTimestamp(record.timestamp) ?? parseTimestamp(record.creationDate);
  },

  consume(record, session, day): void {
    session.assistantTurns += 1;
    session.outputTokens += numberValue(record.completionTokens);
    const model = requestModel(record);
    if (model) session.models.add(model);
    addPrompt(session, requestPrompt(record));
    consumeToolRounds(record, session, day);
  },

  async usage(root: string, sinceMs: number, timezone: string): Promise<ProviderUsageDay[]> {
    const files = await this.discover(root, sinceMs);
    const usage = new Map<string, ProviderUsageDay>();
    for (const file of files) {
      for await (const record of this.read?.(file) ?? []) {
        const timestamp = parseTimestamp(record.timestamp) ?? parseTimestamp(record.creationDate);
        if (timestamp === null || timestamp < sinceMs) continue;
        usageFromRequest(record, timezone, usage);
      }
    }
    return [...usage.values()].sort(
      (left, right) => left.date.localeCompare(right.date) || left.model.localeCompare(right.model),
    );
  },
};
