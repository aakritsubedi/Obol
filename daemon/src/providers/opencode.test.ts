import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDayJournal } from "../data/journal.js";
import { opencodeAdapter } from "./opencode.js";

const TZ = "UTC";
const DATE = "2026-08-25";
const DIRECTORY = "/Users/dev/site";

// The adapter drives whatever sqlite3 the machine has; the tests exercise the
// same binary so a missing CLI skips the suite rather than failing it.
const SQLITE = ["/usr/bin/sqlite3", "/opt/homebrew/bin/sqlite3", "/usr/local/bin/sqlite3"].find(
  (candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
);

const run = promisify(execFile);
const at = (time: string): number => Date.parse(`${DATE}T${time}Z`);

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obol-opencode-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Session ids and text are interpolated into SQL literals, so every quote is
// doubled the way SQLite expects.
const literal = (value: string): string => value.replace(/'/g, "''");

function message(id: string, sessionId: string, time: number, data: Record<string, unknown>): string {
  return `INSERT INTO message (id, session_id, time_created, data) VALUES ('${literal(id)}', '${literal(sessionId)}', ${time}, '${literal(JSON.stringify(data))}')`;
}

function part(
  id: string,
  messageId: string,
  sessionId: string,
  time: number,
  data: Record<string, unknown>,
): string {
  return `INSERT INTO part (id, message_id, session_id, time_created, data) VALUES ('${literal(id)}', '${literal(messageId)}', '${literal(sessionId)}', ${time}, '${literal(JSON.stringify(data))}')`;
}

// Builds the database exactly the way OpenCode lays it out: sessions, the
// turns beneath them, and the parts of each turn.
async function writeDatabase(statements: string[]): Promise<void> {
  await run(SQLITE ?? "", [
    "-batch",
    join(root, "opencode.db"),
    [
      "CREATE TABLE session (id text PRIMARY KEY, parent_id text, directory text, title text, time_created integer, time_updated integer, time_archived integer)",
      "CREATE TABLE message (id text PRIMARY KEY, session_id text, time_created integer, data text)",
      "CREATE TABLE part (id text PRIMARY KEY, message_id text, session_id text, time_created integer, data text)",
      ...statements,
    ].join("; "),
  ]);
}

const PARENT = "ses_parent0000000000000000x";
const CHILD = "ses_child00000000000000000x";

// A full morning on one project: a typed request, an edit, a shell command,
// a multi-file patch, and a subagent replaying work under the same session.
function dayStatements(): string[] {
  return [
    `INSERT INTO session (id, directory, title, time_created, time_updated) VALUES ('${PARENT}', '${DIRECTORY}', 'Fix the login flow', ${at("01:00:00")}, ${at("01:06:00")})`,
    `INSERT INTO session (id, parent_id, directory, title, time_created, time_updated) VALUES ('${CHILD}', '${PARENT}', '${DIRECTORY}', 'Explore auth structure', ${at("01:05:00")}, ${at("01:05:30")})`,
    // A session last touched well before the window opens.
    `INSERT INTO session (id, directory, title, time_created, time_updated) VALUES ('ses_stale00000000000000x', '/Users/dev/old', 'Ancient', ${at("01:00:00") - 7 * 86_400_000}, ${at("01:00:00") - 7 * 86_400_000})`,
    // An archived session whose activity would otherwise land on the day.
    `INSERT INTO session (id, directory, title, time_created, time_updated, time_archived) VALUES ('ses_archived000000000x', '${DIRECTORY}', 'Archived', ${at("02:00:00")}, ${at("02:10:00")}, ${at("03:00:00")})`,

    message(`${PARENT}m1`, PARENT, at("01:00:00"), { role: "user" }),
    part(`${PARENT}m1p1`, `${PARENT}m1`, PARENT, at("01:00:01"), {
      type: "text",
      text: "<ide_opened_file>The user opened /a.ts</ide_opened_file>\nFix the login redirect",
    }),
    message(`${PARENT}m2`, PARENT, at("01:01:00"), {
      role: "assistant",
      modelID: "x-preview-f-free",
      tokens: { input: 900, output: 120 },
    }),
    part(`${PARENT}m2p1`, `${PARENT}m2`, PARENT, at("01:01:30"), {
      type: "tool",
      tool: "edit",
      state: { input: { filePath: "/Users/dev/site/src/auth.ts" } },
    }),
    part(`${PARENT}m2p2`, `${PARENT}m2`, PARENT, at("01:02:00"), {
      type: "patch",
      files: ["/Users/dev/site/src/auth.ts", "/Users/dev/site/src/router.ts"],
    }),
    part(`${PARENT}m2p3`, `${PARENT}m2`, PARENT, at("01:03:00"), {
      type: "tool",
      tool: "bash",
      state: { input: { command: "npm test" } },
    }),
    part(`${PARENT}m2p4`, `${PARENT}m2`, PARENT, at("01:04:00"), {
      type: "reasoning",
    }),

    // The child run's turn and tool call attribute to the parent session; its
    // user message is the agent delegating, not a person typing.
    message(`${CHILD}m1`, CHILD, at("01:05:00"), { role: "user" }),
    part(`${CHILD}m1p1`, `${CHILD}m1`, CHILD, at("01:05:01"), {
      type: "text",
      text: "Map the auth structure",
    }),
    message(`${CHILD}m2`, CHILD, at("01:05:10"), {
      role: "assistant",
      modelID: "x-preview-f-free",
      tokens: { output: 30 },
    }),
    part(`${CHILD}m2p1`, `${CHILD}m2`, CHILD, at("01:05:20"), {
      type: "tool",
      tool: "glob",
      state: { metadata: { count: 4 } },
    }),
  ];
}

function read() {
  return readDayJournal({
    date: DATE,
    timezone: TZ,
    idleMinutes: 15,
    providers: [{ ...opencodeAdapter, root: () => root }],
  });
}

describe.skipIf(!SQLITE)("opencode adapter", () => {
  beforeEach(async () => {
    await writeDatabase(dayStatements());
  });

  it("reads sessions out of the database with their project and timings", async () => {
    const journal = await read();
    expect(journal.providers).toEqual(["opencode"]);
    expect(journal.sessions).toHaveLength(1);
    expect(journal.sessions[0]).toMatchObject({
      provider: "opencode",
      // The journal namespaces ids so agents can never collide.
      id: `opencode:${PARENT}`,
      title: "Fix the login flow",
      project: "site",
      projectPath: DIRECTORY,
      activeMinutes: 5,
    });
    expect(journal.sessions[0].startedAt).toBe(new Date(at("01:00:00")).toISOString());
  });

  it("keeps the person's request and drops the agent's own messages", async () => {
    const journal = await read();
    const session = journal.sessions[0];
    expect(session.humanPrompts).toBe(1);
    expect(session.prompts).toEqual(["Fix the login redirect"]);
    // Both the parent's and the subagent's turns happened.
    expect(session.assistantTurns).toBe(2);
    expect(session.models).toEqual(["x-preview-f-free"]);
  });

  it("counts tool calls across the parent and its subagent, normalised", async () => {
    const journal = await read();
    expect(journal.sessions[0].toolMix).toEqual({ Bash: 1, Edit: 1, Glob: 1 });
    expect(journal.toolMix).toEqual({ Bash: 1, Edit: 1, Glob: 1 });
  });

  it("collects edited files from both the edit tool and patch rows", async () => {
    const journal = await read();
    // auth.ts arrives twice — once per source — and is counted once.
    expect(journal.filesEdited).toBe(2);
    expect(journal.sessions[0].filesEdited.sort()).toEqual([
      "/Users/dev/site/src/auth.ts",
      "/Users/dev/site/src/router.ts",
    ]);
  });

  it("recognises test runs in bash commands", async () => {
    const journal = await read();
    expect(journal.testRuns).toBe(1);
  });

  it("ignores turns that land outside the day", async () => {
    await run(SQLITE ?? "", [
      "-batch",
      join(root, "opencode.db"),
      // Two minutes past local midnight UTC: discovered, but another day's work.
      message("late_m1", PARENT, at("23:59:00") + 120_000, { role: "user" }),
      part("late_m1p1", "late_m1", PARENT, at("23:59:00") + 121_000, {
        type: "text",
        text: "Tomorrow's problem",
      }),
    ]);
    const journal = await read();
    expect(journal.sessions[0].humanPrompts).toBe(1);
    expect(journal.sessions[0].endedAt).toBe(new Date(at("01:05:20")).toISOString());
  });

  it("returns an empty journal without throwing when the database is absent", async () => {
    await rm(root, { recursive: true, force: true });
    const journal = await read();
    expect(journal.sessions).toEqual([]);
    expect(journal.providers).toEqual([]);
  });

  it("escapes quote characters in session ids", async () => {
    await rm(join(root, "opencode.db"), { force: true });
    await writeDatabase([
      `INSERT INTO session (id, directory, title, time_created, time_updated) VALUES ('ses_quote''d00000000000x', '${DIRECTORY}', 'Quoted', ${at("01:00:00")}, ${at("01:01:00")})`,
      message("qm1", "ses_quote'd00000000000x", at("01:00:00"), { role: "user" }),
      part("qm1p1", "qm1", "ses_quote'd00000000000x", at("01:00:10"), {
        type: "text",
        text: "Handle the odd id",
      }),
    ]);
    const journal = await read();
    expect(journal.sessions).toHaveLength(1);
    expect(journal.sessions[0].prompts).toEqual(["Handle the odd id"]);
  });
});
