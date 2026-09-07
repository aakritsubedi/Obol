import { execFile, execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDayJournal } from "../data/journal.js";
import { cursorAdapter } from "./cursor.js";

const TZ = "UTC";
const DATE = "2026-08-25";
const DIRECTORY = "/Users/dev/site";
const PARENT = "composer-parent-0001";
const CHILD = "composer-child-0001";

const SQLITE =
  ["/usr/bin/sqlite3", "/opt/homebrew/bin/sqlite3", "/usr/local/bin/sqlite3"].find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) ??
  (() => {
    try {
      execFileSync("sqlite3", ["--version"], { stdio: "ignore" });
      return "sqlite3";
    } catch {
      return undefined;
    }
  })();

const run = promisify(execFile);
const at = (time: string): number => Date.parse(`${DATE}T${time}Z`);

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obol-cursor-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const literal = (value: string): string => value.replace(/'/g, "''");

function header(
  composerId: string,
  lastUpdatedAt: number,
  options: { isArchived?: number; isSubagent?: number; value?: Record<string, unknown> } = {},
): string {
  return (
    `INSERT INTO composerHeaders ` +
    `(composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, value) VALUES ` +
    `('${literal(composerId)}', '${DIRECTORY}', ${lastUpdatedAt - 60_000}, ${lastUpdatedAt}, ` +
    `${options.isArchived ?? 0}, ${options.isSubagent ?? 0}, '${literal(JSON.stringify(options.value ?? {}))}')`
  );
}

function bubble(composerId: string, bubbleId: string, value: Record<string, unknown>): string {
  return `INSERT INTO cursorDiskKV (key, value) VALUES ('${literal(`bubbleId:${composerId}:${bubbleId}`)}', '${literal(JSON.stringify(value))}')`;
}

async function writeDatabase(statements: string[]): Promise<void> {
  await run(SQLITE ?? "", [
    "-batch",
    join(root, "state.vscdb"),
    [
      "CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, value TEXT)",
      "CREATE TABLE cursorDiskKV (key TEXT, value BLOB)",
      ...statements,
    ].join("; "),
  ]);
}

function read() {
  return readDayJournal({
    date: DATE,
    timezone: TZ,
    idleMinutes: 15,
    providers: [{ ...cursorAdapter, root: () => root }],
  });
}

describe.skipIf(!SQLITE)("cursor adapter", () => {
  beforeEach(async () => {
    await writeDatabase([
      header(PARENT, at("01:02:00")),
      header(CHILD, at("01:03:00"), { isSubagent: 1, value: { parentComposerId: PARENT } }),
      header("archived", at("02:00:00"), { isArchived: 1 }),
      header("stale", at("01:00:00") - 7 * 86_400_000),
      bubble(PARENT, "user", {
        type: 1,
        createdAt: `${DATE}T01:00:00.000Z`,
        text: "Fix the login redirect",
        modelInfo: { modelName: "composer-2.5" },
        tokenCount: { inputTokens: 400, outputTokens: 100 },
      }),
      bubble(PARENT, "assistant", {
        type: 2,
        createdAt: `${DATE}T01:01:00.000Z`,
        text: "Done",
        tokenCount: {},
      }),
      bubble(CHILD, "assistant", {
        type: 2,
        createdAt: `${DATE}T01:02:00.000Z`,
        text: "Inspected the route",
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
      bubble(CHILD, "malformed-model", {
        type: 2,
        createdAt: `${DATE}T01:02:30.000Z`,
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
    ]);
  });

  it("reads composer headers and folds subagent bubbles into the parent session", async () => {
    const journal = await read();
    expect(journal.providers).toEqual(["cursor"]);
    expect(journal.sessions).toHaveLength(1);
    expect(journal.sessions[0]).toMatchObject({
      id: `cursor:${PARENT}`,
      provider: "cursor",
      project: "site",
      humanPrompts: 1,
      assistantTurns: 3,
      outputTokens: 100,
      models: ["composer-2.5"],
      prompts: ["Fix the login redirect"],
    });
    expect(journal.sessions[0].startedAt).toBe(new Date(at("01:00:00")).toISOString());
    expect(journal.sessions[0].endedAt).toBe(new Date(at("01:02:30")).toISOString());
  });

  it("reports only non-zero token counts and never fabricates Cursor cost rows", async () => {
    const usage = await cursorAdapter.usage?.(root, Date.parse(`${DATE}T00:00:00Z`), TZ);
    expect(usage).toEqual([
      {
        date: DATE,
        model: "composer-2.5",
        inputTokens: 400,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    ]);
  });

  it("returns an empty journal when the database is absent", async () => {
    await rm(join(root, "state.vscdb"), { force: true });
    const journal = await read();
    expect(journal.sessions).toEqual([]);
    expect(journal.providers).toEqual([]);
  });
});
