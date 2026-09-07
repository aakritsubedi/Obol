import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { asRecord, numberValue } from "../../shared/coerce.js";

// VS Code stores a chat session as an append-only patch log rather than one
// document: a seed record holds the session as it was, and every later line
// edits it in place. Replaying the file start to finish rebuilds the session's
// final state — the only way to learn what a turn actually cost, because token
// counts are rewritten as the answer streams rather than written once.
const SEED = 0;
const SET = 1;
const APPEND = 2;

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === "object" && value !== null;
}

// A numeric key means the parent has to be an array; anything else is an object.
function childContainer(nextKey: string | number): Container {
  return typeof nextKey === "number" || /^\d+$/.test(String(nextKey)) ? [] : {};
}

function cloneValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return {};
  }
}

function descend(current: Container, key: string | number, nextKey: string | number): Container | null {
  if (Array.isArray(current)) {
    const position = Number(key);
    if (!Number.isInteger(position) || position < 0) return null;
    if (!isContainer(current[position])) current[position] = childContainer(nextKey);
    return current[position] as Container;
  }
  const name = String(key);
  if (!isContainer(current[name])) current[name] = childContainer(nextKey);
  return current[name] as Container;
}

export function setPath(root: Record<string, unknown>, path: Array<string | number>, value: unknown): void {
  if (path.length === 0) return;
  let current: Container = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const next = descend(current, path[index] as string | number, path[index + 1] as string | number);
    if (!next) return;
    current = next;
  }

  const key = path[path.length - 1] as string | number;
  if (Array.isArray(current)) {
    const position = Number(key);
    if (Number.isInteger(position) && position >= 0) current[position] = value;
    return;
  }
  current[String(key)] = value;
}

export function getPath(root: Record<string, unknown>, path: Array<string | number>): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (Array.isArray(current)) {
      const position = Number(key);
      if (!Number.isInteger(position) || position < 0) return undefined;
      current = current[position];
    } else if (isContainer(current)) {
      current = (current as Record<string, unknown>)[String(key)];
    } else {
      return undefined;
    }
  }
  return current;
}

// An append carries the items to add, so a list value adds each of its entries
// rather than nesting the list itself. VS Code sends a new chat turn that way —
// `{"k":["requests"],"v":[{…}]}` means "add this one request", and pushing the
// wrapper instead would bury the turn one level down where nothing can read it.
export function appendPath(
  root: Record<string, unknown>,
  path: Array<string | number>,
  value: unknown,
): void {
  const additions = Array.isArray(value) ? value : [value];
  const current = getPath(root, path);
  if (Array.isArray(current)) current.push(...additions);
  else setPath(root, path, additions);
}

export function replayPatchLog(lines: Iterable<string>): Record<string, unknown> {
  let session: Record<string, unknown> = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    let patch: Record<string, unknown>;
    try {
      patch = asRecord(JSON.parse(line));
    } catch {
      // A log being written while it is read can end mid-line; the records
      // already replayed still describe the session up to that point.
      continue;
    }
    const kind = numberValue(patch.kind, -1);
    if (kind === SEED) {
      session = asRecord(cloneValue(patch.v));
      continue;
    }
    if (kind !== SET && kind !== APPEND) continue;
    const path = Array.isArray(patch.k)
      ? patch.k.filter((key): key is string | number => typeof key === "string" || typeof key === "number")
      : [];
    if (path.length === 0) continue;
    if (kind === SET) setPath(session, path, cloneValue(patch.v));
    else appendPath(session, path, cloneValue(patch.v));
  }
  return session;
}

export async function readPatchLog(path: string): Promise<Record<string, unknown>> {
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
