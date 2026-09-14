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
  options: {
    isArchived?: number;
    isSubagent?: number;
    value?: Record<string, unknown>;
    neverUpdated?: boolean;
  } = {},
): string {
  const updated = options.neverUpdated ? "NULL" : String(lastUpdatedAt);
  return (
    `INSERT INTO composerHeaders ` +
    `(composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, value) VALUES ` +
    `('${literal(composerId)}', '${DIRECTORY}', ${lastUpdatedAt - 60_000}, ${updated}, ` +
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

async function appendToDatabase(statements: string[]): Promise<void> {
  await run(SQLITE ?? "", ["-batch", join(root, "state.vscdb"), statements.join("; ")]);
}

function composerData(composerId: string, value: Record<string, unknown>): string {
  return `INSERT INTO cursorDiskKV (key, value) VALUES ('${literal(`composerData:${composerId}`)}', '${literal(JSON.stringify(value))}')`;
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
      header(PARENT, at("01:02:00"), { value: { name: "Fix the login redirect flow" } }),
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

  it("sums the token counts Cursor did record, without adding a row per bubble", async () => {
    // The parent turn carries real counts and is reported as counted. The
    // subagent conversation carries none, so what it generated is estimated
    // from its text — five tokens on top of the hundred Cursor recorded.
    const usage = await cursorAdapter.usage?.(root, Date.parse(`${DATE}T00:00:00Z`), TZ);
    expect(usage).toEqual([
      {
        date: DATE,
        model: "composer-2.5",
        inputTokens: 400,
        outputTokens: 105,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    ]);
  });

  it("attributes tokenized bubbles without model metadata to the known daily model", async () => {
    await appendToDatabase([
      bubble(PARENT, "missing-model", {
        type: 2,
        createdAt: `${DATE}T01:04:00.000Z`,
        tokenCount: { inputTokens: 100, outputTokens: 2 },
      }),
    ]);

    const usage = await cursorAdapter.usage?.(root, Date.parse(`${DATE}T00:00:00Z`), TZ);
    expect(usage).toEqual([
      {
        date: DATE,
        model: "composer-2.5",
        inputTokens: 500,
        outputTokens: 107,
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

  it("finds a composer Cursor has not stamped an update onto", async () => {
    // Cursor leaves lastUpdatedAt null until a conversation is revisited, and a
    // null satisfies no comparison — so a session used exactly once, which is
    // the common case for a short task, would otherwise never be discovered.
    await appendToDatabase([
      header("once-only", at("09:00:00"), { neverUpdated: true }),
      bubble("once-only", "user", {
        type: 1,
        createdAt: `${DATE}T09:00:00.000Z`,
        text: "Rename the helper",
      }),
      bubble("once-only", "assistant", {
        type: 2,
        createdAt: `${DATE}T09:01:00.000Z`,
        modelInfo: { modelName: "composer-3" },
        tokenCount: { inputTokens: 900, outputTokens: 40 },
      }),
    ]);

    const journal = await read();
    expect(journal.sessions.map((session) => session.id)).toContain("cursor:once-only");

    const usage = await cursorAdapter.usage?.(root, at("00:00:00"), TZ);
    expect(usage).toContainEqual({
      date: DATE,
      model: "composer-3",
      inputTokens: 900,
      outputTokens: 40,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("titles a session with the name Cursor gives the conversation", async () => {
    // Cursor labels each composer; that name is more use in the timeline than a
    // headline derived from whatever the first prompt happened to say.
    const journal = await read();
    const session = journal.sessions.find((entry) => entry.id === `cursor:${PARENT}`);
    expect(session?.title).toBe("Fix the login redirect flow");
  });

  it("does not treat the header's creation time as session activity", async () => {
    // The header is metadata; counting its timestamp would start every session
    // at whenever the conversation was first opened.
    const journal = await read();
    const session = journal.sessions.find((entry) => entry.id === `cursor:${PARENT}`);
    expect(session?.startedAt).toBe(`${DATE}T01:00:00.000Z`);
  });

  it("still reports a day Cursor worked but recorded no tokens", async () => {
    // Cursor writes tokenCount on every bubble and leaves it at zero. Skipping
    // those days would drop Cursor out of the provider and history views
    // entirely, reading as "never used" rather than "never reported".
    const NEXT = "2026-08-26";
    const later = (time: string): number => Date.parse(`${NEXT}T${time}Z`);
    await appendToDatabase([
      header("quiet-day", later("09:00:00"), { neverUpdated: true }),
      bubble("quiet-day", "user", {
        type: 1,
        createdAt: `${NEXT}T09:00:00.000Z`,
        text: "Tidy the imports",
        modelInfo: { modelName: "composer-2.5" },
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
      bubble("quiet-day", "assistant", {
        type: 2,
        createdAt: `${NEXT}T09:01:00.000Z`,
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
    ]);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    const quiet = usage.filter((row) => row.date === NEXT);
    expect(quiet).toEqual([
      {
        date: NEXT,
        model: "composer-2.5",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    ]);
  });

  it("reconstructs usage from the context snapshot when Cursor counted nothing", async () => {
    // With nothing stamped per turn, the composer's own context snapshot is all
    // there is: one turn sent that whole context, and it was written to cache
    // rather than read back, because there was no earlier turn to read from.
    const NEXT = "2026-08-27";
    await appendToDatabase([
      header("modelled", Date.parse(`${NEXT}T09:10:00Z`), { neverUpdated: true }),
      composerData("modelled", {
        promptTokenBreakdown: {
          totalUsedTokens: 1200,
          categories: [
            { id: "system_prompt", estimatedTokens: 400 },
            { id: "tools", estimatedTokens: 600 },
            { id: "conversation", estimatedTokens: 200 },
          ],
        },
      }),
      bubble("modelled", "user", {
        type: 1,
        createdAt: `${NEXT}T09:00:00.000Z`,
        text: "Rename the helper",
        modelInfo: { modelName: "composer-2.5" },
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
      bubble("modelled", "a1", {
        type: 2,
        createdAt: `${NEXT}T09:01:00.000Z`,
        text: "AAAAAAAA",
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
      bubble("modelled", "a2", {
        type: 2,
        createdAt: `${NEXT}T09:02:00.000Z`,
        text: "BBBB",
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
    ]);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    expect(usage.filter((row) => row.date === NEXT)).toEqual([
      {
        date: NEXT,
        model: "composer-2.5",
        cacheCreationTokens: 1200,
        cacheReadTokens: 0,
        inputTokens: 0,
        // Eight characters then four, at four characters to a token.
        outputTokens: 3,
      },
    ]);
  });

  it("prices each turn against the context size Cursor stamped on it", async () => {
    // `contextWindowStatusAtCreation` is written once, when the turn runs, and
    // never revised — so a day's figures stay put as the conversation grows,
    // which is what the single end-of-conversation snapshot could not do.
    const NEXT = "2026-08-30";
    const status = (tokensUsed: number) => ({ tokensUsed, tokenLimit: 200_000 });
    await appendToDatabase([
      header("anchored", Date.parse(`${NEXT}T09:30:00Z`), { neverUpdated: true }),
      bubble("anchored", "u1", {
        type: 1,
        createdAt: `${NEXT}T09:00:00.000Z`,
        text: "Start",
        modelInfo: { modelName: "composer-2.5" },
        contextWindowStatusAtCreation: status(10_000),
      }),
      bubble("anchored", "u2", {
        type: 1,
        createdAt: `${NEXT}T09:10:00.000Z`,
        text: "Keep going",
        modelInfo: { modelName: "composer-2.5" },
        contextWindowStatusAtCreation: status(25_000),
      }),
    ]);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    expect(usage.find((row) => row.date === NEXT)).toMatchObject({
      // The first turn writes its whole context; the second re-reads it and
      // only pays fresh input on the 15,000 it grew by.
      cacheCreationTokens: 10_000,
      cacheReadTokens: 10_000,
      inputTokens: 15_000,
    });
  });

  it("charges a cache read for every model call a turn makes", async () => {
    // Each tool result has to go back to the model to be acted on, so a turn
    // costs one model call per tool call plus the one that ends it — and every
    // one of them re-sends the conversation. Dropping those reads is what
    // priced a thousand-call session as if it had sent its context once.
    const NEXT = "2026-08-31";
    const statements = [
      header("agentic", Date.parse(`${NEXT}T09:30:00Z`), { neverUpdated: true }),
      bubble("agentic", "u1", {
        type: 1,
        createdAt: `${NEXT}T09:00:00.000Z`,
        text: "Refactor it",
        modelInfo: { modelName: "composer-2.5" },
        contextWindowStatusAtCreation: { tokensUsed: 50_000, tokenLimit: 200_000 },
      }),
    ];
    for (let index = 0; index < 9; index += 1) {
      statements.push(
        bubble("agentic", `t${index}`, {
          type: 2,
          createdAt: `${NEXT}T09:0${index}:30.000Z`,
          toolFormerData: { name: "read_file_v2", status: "completed" },
        }),
      );
    }
    await appendToDatabase(statements);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    // Nine tool calls plus the closing call: one writes the context, nine read
    // it back.
    expect(usage.find((row) => row.date === NEXT)).toMatchObject({
      cacheCreationTokens: 50_000,
      cacheReadTokens: 9 * 50_000,
    });
  });

  it("treats a shrinking context as a compaction that rewrites the cache", async () => {
    // Cursor summarizes when the window fills, and the sawtooth that leaves in
    // the context sizes is not a conversation getting cheaper: the summary that
    // replaces the transcript is new text, so it is written, never read back.
    const NEXT = "2026-09-01";
    const status = (tokensUsed: number) => ({ tokensUsed, tokenLimit: 200_000 });
    await appendToDatabase([
      header("compacted", Date.parse(`${NEXT}T09:30:00Z`), { neverUpdated: true }),
      bubble("compacted", "u1", {
        type: 1,
        createdAt: `${NEXT}T09:00:00.000Z`,
        text: "One",
        modelInfo: { modelName: "composer-2.5" },
        contextWindowStatusAtCreation: status(180_000),
      }),
      bubble("compacted", "u2", {
        type: 1,
        createdAt: `${NEXT}T09:10:00.000Z`,
        text: "Two",
        modelInfo: { modelName: "composer-2.5" },
        contextWindowStatusAtCreation: status(30_000),
      }),
    ]);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    expect(usage.find((row) => row.date === NEXT)).toMatchObject({
      cacheCreationTokens: 180_000 + 30_000,
      cacheReadTokens: 0,
      inputTokens: 0,
    });
  });

  it("keeps reconstructed turns when a later turn carries real counts", async () => {
    // The old check flipped a whole conversation to "recorded" as soon as any
    // one bubble carried a number, which silently dropped every reconstructed
    // turn beside it — the day's total fell as the conversation grew.
    const NEXT = "2026-09-02";
    const status = (tokensUsed: number) => ({ tokensUsed, tokenLimit: 200_000 });
    await appendToDatabase([
      header("mixed", Date.parse(`${NEXT}T09:30:00Z`), { neverUpdated: true }),
      bubble("mixed", "u1", {
        type: 1,
        createdAt: `${NEXT}T09:00:00.000Z`,
        text: "One",
        modelInfo: { modelName: "composer-2.5" },
        contextWindowStatusAtCreation: status(8_000),
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
      bubble("mixed", "u2", {
        type: 1,
        createdAt: `${NEXT}T09:10:00.000Z`,
        text: "Two",
        modelInfo: { modelName: "composer-2.5" },
        contextWindowStatusAtCreation: status(12_000),
        tokenCount: { inputTokens: 700, outputTokens: 60 },
      }),
    ]);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    expect(usage.find((row) => row.date === NEXT)).toMatchObject({
      // Turn one is still reconstructed; turn two is reported as Cursor counted it.
      cacheCreationTokens: 8_000,
      cacheReadTokens: 0,
      inputTokens: 700,
      outputTokens: 60,
    });
  });

  it("does not re-charge a long session's context as fresh input", async () => {
    // A long session re-sends its context on every call, but the repeat is a
    // cache read at a tenth of the rate — never fresh input. What is charged as
    // input stays bounded by how far the context actually grew.
    const NEXT = "2026-08-28";
    const turns = 200;
    const statements = [
      header("long-session", Date.parse(`${NEXT}T12:00:00Z`), { neverUpdated: true }),
      composerData("long-session", {
        promptTokenBreakdown: {
          totalUsedTokens: 12_000,
          categories: [
            { id: "system_prompt", estimatedTokens: 500 },
            { id: "tools", estimatedTokens: 9_000 },
            { id: "conversation", estimatedTokens: 2_500 },
          ],
        },
      }),
    ];
    for (let index = 0; index < turns; index += 1) {
      const minute = String(index % 60).padStart(2, "0");
      const hour = String(Math.floor(index / 60)).padStart(2, "0");
      statements.push(
        bubble("long-session", `u${index}`, {
          type: 1,
          createdAt: `${NEXT}T${hour}:${minute}:00.000Z`,
          text: "x",
          modelInfo: { modelName: "composer-2.5" },
          tokenCount: { inputTokens: 0, outputTokens: 0 },
        }),
      );
    }
    await appendToDatabase(statements);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    const day = usage.find((row) => row.date === NEXT);
    // The context ramps to 12,000 across the session and is never exceeded, so
    // that is the whole of what gets written and charged fresh.
    expect((day?.cacheCreationTokens ?? 0) + (day?.inputTokens ?? 0)).toBe(12_000);
    // The reads are the repeats, and there is one per turn after the first.
    expect(day?.cacheReadTokens).toBeGreaterThan(12_000);
  });

  it("treats summarized conversation as harness overhead", async () => {
    const NEXT = "2026-08-29";
    await appendToDatabase([
      header("summarized", Date.parse(`${NEXT}T09:00:00Z`), { neverUpdated: true }),
      composerData("summarized", {
        promptTokenBreakdown: {
          categories: [
            { id: "tools", estimatedTokens: 1_000 },
            { id: "summarized_conversation", estimatedTokens: 500 },
            { id: "conversation", estimatedTokens: 100 },
          ],
        },
      }),
      bubble("summarized", "a1", {
        type: 2,
        createdAt: `${NEXT}T09:01:00.000Z`,
        text: "AAAA",
        modelInfo: { modelName: "composer-2.5" },
        tokenCount: { inputTokens: 0, outputTokens: 0 },
      }),
    ]);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    expect(usage.find((row) => row.date === NEXT)).toMatchObject({
      cacheCreationTokens: 1_600,
      inputTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 1,
    });
  });

  it("uses the counts Cursor recorded rather than reconstructing them", async () => {
    // The shared fixture's parent conversation carries real counts, so its
    // context shape must be ignored — charging both would double the bill.
    await appendToDatabase([
      composerData(PARENT, {
        promptTokenBreakdown: {
          categories: [{ id: "tools", estimatedTokens: 99_999 }],
        },
      }),
    ]);

    const usage = (await cursorAdapter.usage?.(root, at("00:00:00"), TZ)) ?? [];
    const day = usage.find((row) => row.date === DATE);
    expect(day?.inputTokens).toBe(400);
    expect(day?.cacheReadTokens).toBe(0);
  });
});
