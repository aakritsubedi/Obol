import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDayJournal } from "../data/journal.js";
import { copilotAdapter } from "./copilot.js";

const TZ = "UTC";
const DATE = "2026-08-25";
const WORKSPACE = "workspace-8fc74ad6";

let root = "";

const at = (time: string): number => Date.parse(`${DATE}T${time}Z`);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obol-copilot-"));
  const workspace = join(root, WORKSPACE);
  await mkdir(join(workspace, "chatSessions"), { recursive: true });
  await writeFile(
    join(workspace, "workspace.json"),
    JSON.stringify({ folder: "file:///Users/dev/site" }),
    "utf8",
  );
  await writeFile(join(workspace, "chatSessions", "session-1.jsonl"), fixture(), "utf8");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fixture(): string {
  return [
    JSON.stringify({
      kind: 0,
      v: {
        sessionId: "session-1",
        creationDate: at("01:00:00"),
        inputState: { selectedModel: { metadata: { family: "gpt-4o" } } },
        requests: [
          {
            timestamp: at("01:01:00"),
            message: { text: "Fix the login redirect" },
            modelId: "copilot/auto",
            response: [{ kind: "autoModeResolution", resolvedModel: "gpt-5-mini" }],
            result: {
              metadata: {
                toolCallRounds: [
                  {
                    toolCalls: [
                      {
                        name: "Edit",
                        arguments: JSON.stringify({ filePath: "/Users/dev/site/src/auth.ts" }),
                      },
                      { name: "Bash", arguments: JSON.stringify({ command: "npm test" }) },
                      {
                        name: "read_file",
                        arguments: JSON.stringify({ filePath: "/Users/dev/site/src/config.ts" }),
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    }),
    JSON.stringify({ kind: 1, k: ["requests", 0, "promptTokens"], v: 10 }),
    JSON.stringify({ kind: 1, k: ["requests", 0, "promptTokens"], v: 27_000 }),
    JSON.stringify({ kind: 1, k: ["requests", 0, "completionTokens"], v: 60 }),
    JSON.stringify({ kind: 1, k: ["requests", 0, "completionTokens"], v: 120 }),
    JSON.stringify({
      kind: 2,
      k: ["requests"],
      v: [
        {
          message: { text: "Check the tests" },
          selectedModel: { metadata: { family: "claude-haiku-4.5" } },
          timestamp: at("01:02:00"),
          promptTokens: 3_000,
          completionTokens: 30,
        },
      ],
    }),
    // A turn whose only model hint is the router alias, which prices at nothing
    // until the session's own selection names the family behind it.
    JSON.stringify({
      kind: 2,
      k: ["requests"],
      v: [
        {
          message: { text: "Ship it" },
          modelId: "copilot/auto",
          timestamp: at("01:03:00"),
          promptTokens: 500,
          completionTokens: 10,
        },
      ],
    }),
    '{"kind":1,"k":["requests",0,"promptTokens"]',
  ].join("\n");
}

function read() {
  return readDayJournal({
    date: DATE,
    timezone: TZ,
    idleMinutes: 15,
    providers: [{ ...copilotAdapter, root: () => root }],
  });
}

describe("copilot adapter", () => {
  it("replays patch logs, keeps the last cumulative token write, and attributes the workspace", async () => {
    const journal = await read();
    expect(journal.providers).toEqual(["copilot"]);
    expect(journal.sessions).toHaveLength(1);
    expect(journal.sessions[0]).toMatchObject({
      provider: "copilot",
      project: "site",
      projectPath: "",
      humanPrompts: 3,
      assistantTurns: 3,
      outputTokens: 160,
      models: ["claude-haiku-4.5", "gpt-4o", "gpt-5-mini"],
      prompts: ["Fix the login redirect", "Check the tests", "Ship it"],
    });
    expect(journal.sessions[0].toolMix).toEqual({ Bash: 1, Edit: 1, read_file: 1 });
    expect(journal.sessions[0].filesEdited).toEqual(["/Users/dev/site/src/auth.ts"]);
    expect(journal.toolMix).toEqual({ Bash: 1, Edit: 1, read_file: 1 });
    expect(journal.filesEdited).toBe(1);
    expect(journal.testRuns).toBe(1);
  });

  it("groups finalized request usage by timezone day and model", async () => {
    const usage = await copilotAdapter.usage?.(root, Date.parse(`${DATE}T00:00:00Z`), TZ);
    expect(usage).toEqual([
      {
        date: DATE,
        model: "claude-haiku-4.5",
        inputTokens: 3_000,
        outputTokens: 30,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      {
        date: DATE,
        model: "gpt-4o",
        inputTokens: 500,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      {
        date: DATE,
        model: "gpt-5-mini",
        inputTokens: 27_000,
        outputTokens: 120,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    ]);
  });

  it("reads a turn appended as a list rather than burying it in a wrapper", async () => {
    // VS Code delivers a new turn as `{"k":["requests"],"v":[{…}]}`. Pushing the
    // list itself would leave the turn unreadable: no tokens, no time, no model.
    const usage = (await copilotAdapter.usage?.(root, Date.parse(`${DATE}T00:00:00Z`), TZ)) ?? [];
    expect(usage.map((row) => row.model)).toContain("claude-haiku-4.5");
    expect(usage.reduce((total, row) => total + row.inputTokens, 0)).toBe(30_500);
  });

  it("counts a read as a tool call but never as an edited file", async () => {
    const journal = await read();
    expect(journal.sessions[0]?.toolMix).toMatchObject({ read_file: 1 });
    expect(journal.sessions[0]?.filesEdited).toEqual(["/Users/dev/site/src/auth.ts"]);
  });
});
