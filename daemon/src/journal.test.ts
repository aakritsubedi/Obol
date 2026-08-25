import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeSpan, projectName, promptText, readDayJournal } from "./journal.js";
import { claudeAdapter } from "./providers/claude.js";

const TZ = "UTC";
const DATE = "2026-08-25";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obol-journal-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function at(time: string): string {
  return `${DATE}T${time}Z`;
}

function assistant(timestamp: string, tools: Array<Record<string, unknown>> = []): string {
  return JSON.stringify({
    type: "assistant",
    timestamp,
    cwd: "/Users/dev/demo",
    gitBranch: "main",
    message: {
      model: "claude-opus-5",
      usage: { output_tokens: 100 },
      content: tools.map((tool) => ({ type: "tool_use", ...tool })),
    },
  });
}

async function writeSession(project: string, id: string, lines: string[]): Promise<void> {
  const directory = join(root, project);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${id}.jsonl`), `${lines.join("\n")}\n`, "utf8");
}

async function writeSubagent(project: string, id: string, agent: string, lines: string[]): Promise<void> {
  const directory = join(root, project, id, "subagents");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${agent}.jsonl`), `${lines.join("\n")}\n`, "utf8");
}

function read(overrides: Partial<Parameters<typeof readDayJournal>[0]> = {}) {
  return readDayJournal({
    date: DATE,
    timezone: TZ,
    idleMinutes: 15,
    // Point the real Claude adapter at the fixture tree; everything else about
    // it, including discovery, is exercised as it ships.
    providers: [{ ...claudeAdapter, root: () => root }],
    ...overrides,
  });
}

describe("activeSpan", () => {
  it("sums only the gaps that fall under the idle threshold", () => {
    const base = Date.parse("2026-08-25T00:00:00Z");
    const timestamps = [base, base + 60_000, base + 120_000];
    expect(activeSpan(timestamps, 15 * 60_000)).toEqual({
      activeMs: 120_000,
      blocks: 1,
      spanMs: 120_000,
    });
  });

  it("splits into blocks on a gap longer than the threshold and excludes it", () => {
    const base = Date.parse("2026-08-25T00:00:00Z");
    const timestamps = [base, base + 60_000, base + 3_600_000, base + 3_660_000];
    const span = activeSpan(timestamps, 15 * 60_000);
    expect(span.blocks).toBe(2);
    expect(span.activeMs).toBe(120_000);
    expect(span.spanMs).toBe(3_660_000);
  });

  it("returns zeroes for no events and a single event", () => {
    expect(activeSpan([], 60_000)).toEqual({ activeMs: 0, blocks: 0, spanMs: 0 });
    expect(activeSpan([1_000], 60_000)).toEqual({ activeMs: 0, blocks: 1, spanMs: 0 });
  });

  it("does not depend on input order", () => {
    const base = Date.parse("2026-08-25T00:00:00Z");
    const ordered = activeSpan([base, base + 60_000, base + 120_000], 15 * 60_000);
    const shuffled = activeSpan([base + 120_000, base, base + 60_000], 15 * 60_000);
    expect(shuffled).toEqual(ordered);
  });
});

describe("projectName", () => {
  it("takes the last path segment", () => {
    expect(projectName("/Users/dev/murmur/voicepal")).toBe("voicepal");
  });

  it("falls back to the last dashed segment of a project slug", () => {
    expect(projectName("-Users-dev-murmur-voicepal")).toBe("voicepal");
  });
});

describe("promptText", () => {
  it("keeps the first prose line of a plain string prompt", () => {
    expect(promptText("Fix the CORS bug\nand add a test")).toBe("Fix the CORS bug");
  });

  it("reads text blocks out of array content", () => {
    expect(promptText([{ type: "text", text: "Ship the parser" }])).toBe("Ship the parser");
  });

  it("strips the editor context injected around a prompt", () => {
    expect(promptText("<ide_selection>lines 4 to 9 of app.ts</ide_selection>\n\nFix the CORS bug")).toBe(
      "Fix the CORS bug",
    );
  });

  it("returns nothing when the record carried only injected context", () => {
    expect(promptText("<ide_opened_file>The user opened /a.ts</ide_opened_file>")).toBe("");
    expect(promptText("<command-name>/loop</command-name>")).toBe("");
  });

  it("ignores tool_result blocks and non-text content", () => {
    expect(promptText([{ type: "tool_result", content: "ok" }])).toBe("");
    expect(promptText(null)).toBe("");
    expect(promptText(42)).toBe("");
  });

  it("truncates a very long line with an ellipsis", () => {
    const text = promptText("x".repeat(400));
    expect(text).toHaveLength(180);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("readDayJournal", () => {
  it("returns a zeroed journal when nothing ran that day", async () => {
    const journal = await read();
    expect(journal.sessions).toEqual([]);
    expect(journal.activeMinutes).toBe(0);
    expect(journal.blocks).toBe(0);
    expect(journal.firstEventAt).toBeNull();
  });

  it("counts only records whose timestamp falls on the requested day", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      assistant("2026-08-24T23:59:00Z", [{ name: "Bash", input: { command: "ls" } }]),
      assistant(at("01:00:00"), [{ name: "Bash", input: { command: "ls" } }]),
      assistant("2026-08-26T00:01:00Z", [{ name: "Bash", input: { command: "ls" } }]),
    ]);
    const journal = await read();
    expect(journal.toolCalls).toBe(1);
    expect(journal.sessions).toHaveLength(1);
    expect(journal.sessions[0].startedAt).toBe(new Date(at("01:00:00")).toISOString());
  });

  it("counts human-origin records as prompts and ignores tool results", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      JSON.stringify({
        type: "user",
        timestamp: at("01:00:00"),
        origin: { kind: "human" },
        message: { content: "Fix the CORS bug" },
      }),
      JSON.stringify({
        type: "user",
        timestamp: at("01:01:00"),
        message: { content: [{ type: "tool_result", content: "ok" }] },
      }),
      JSON.stringify({
        type: "user",
        timestamp: at("01:02:00"),
        isSidechain: true,
        origin: { kind: "human" },
        message: { content: "sidechain ask" },
      }),
    ]);
    const journal = await read();
    expect(journal.humanPrompts).toBe(1);
    expect(journal.sessions[0].prompts).toEqual(["Fix the CORS bug"]);
  });

  it("does not count a human record that carried only injected editor context", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      assistant(at("01:00:00")),
      JSON.stringify({
        type: "user",
        timestamp: at("01:01:00"),
        origin: { kind: "human" },
        message: { content: "<ide_opened_file>The user opened /a.ts</ide_opened_file>" },
      }),
    ]);
    const journal = await read();
    expect(journal.humanPrompts).toBe(0);
    expect(journal.sessions[0].prompts).toEqual([]);
  });

  it("caps the prompts kept for one session", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      assistant(at("01:00:00")),
      ...Array.from({ length: 9 }, (_, index) =>
        JSON.stringify({
          type: "user",
          timestamp: at("01:00:00"),
          origin: { kind: "human" },
          message: { content: `Ask number ${index}` },
        }),
      ),
    ]);
    const journal = await read();
    expect(journal.humanPrompts).toBe(9);
    expect(journal.sessions[0].prompts).toHaveLength(6);
  });

  it("records a per-session tool mix alongside the day's total", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      assistant(at("01:00:00"), [
        { name: "Bash", input: { command: "ls" } },
        { name: "Bash", input: { command: "pwd" } },
        { name: "Read", input: {} },
      ]),
    ]);
    const journal = await read();
    expect(journal.sessions[0].toolMix).toEqual({ Bash: 2, Read: 1 });
    expect(journal.toolMix).toEqual({ Bash: 2, Read: 1 });
  });

  it("counts subagent tool calls without listing the subagent as a session", async () => {
    await writeSession("-Users-dev-demo", "s1", [assistant(at("01:00:00"), [{ name: "Agent", input: {} }])]);
    await writeSubagent("-Users-dev-demo", "s1", "agent-abc", [
      assistant(at("01:01:00"), [{ name: "Bash", input: { command: "ls" } }]),
    ]);
    const journal = await read();
    expect(journal.sessions).toHaveLength(1);
    // Ids are namespaced by provider so two agents cannot collide on a uuid.
    expect(journal.sessions[0].id).toBe("claude:s1");
    expect(journal.sessions[0].provider).toBe("claude");
    expect(journal.toolCalls).toBe(2);
    expect(journal.toolMix).toEqual({ Agent: 1, Bash: 1 });
  });

  it("skips records without a timestamp and a torn final line", async () => {
    const directory = join(root, "-Users-dev-demo");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "s1.jsonl"),
      [
        JSON.stringify({ type: "queue-operation", operation: "enqueue" }),
        assistant(at("01:00:00"), [{ name: "Bash", input: { command: "ls" } }]),
        '{"type":"assistant","timesta',
      ].join("\n"),
      "utf8",
    );
    const journal = await read();
    expect(journal.toolCalls).toBe(1);
  });

  it("keeps the last ai-title for a session", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      JSON.stringify({ type: "ai-title", aiTitle: "First guess" }),
      assistant(at("01:00:00")),
      JSON.stringify({ type: "ai-title", aiTitle: "Settled title" }),
    ]);
    const journal = await read();
    expect(journal.sessions[0].title).toBe("Settled title");
  });

  it("keeps the opening cwd when a later record reports a subdirectory", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      assistant(at("01:00:00")),
      JSON.stringify({
        type: "assistant",
        timestamp: at("01:01:00"),
        cwd: "/Users/dev/demo/packages/inner",
        message: { content: [] },
      }),
    ]);
    const journal = await read();
    expect(journal.sessions[0].project).toBe("demo");
  });

  it("collects distinct edited files and recognises test commands", async () => {
    await writeSession("-Users-dev-demo", "s1", [
      assistant(at("01:00:00"), [
        { name: "Edit", input: { file_path: "/a.ts" } },
        { name: "Edit", input: { file_path: "/a.ts" } },
        { name: "Write", input: { file_path: "/b.ts" } },
        { name: "Bash", input: { command: "npm run test" } },
        { name: "Bash", input: { command: "ls -la" } },
      ]),
    ]);
    const journal = await read();
    expect(journal.filesEdited).toBe(2);
    expect(journal.testRuns).toBe(1);
    expect(journal.sessions[0].filesEdited).toEqual(["/a.ts", "/b.ts"]);
  });

  it("apportions project cost across sessions by output tokens", async () => {
    await writeSession("-Users-dev-demo", "s1", [assistant(at("01:00:00"))]);
    await writeSession("-Users-dev-demo", "s2", [assistant(at("02:00:00")), assistant(at("02:01:00"))]);
    const journal = await read({
      report: {
        // The daily row is all-agent: $30 of Claude plus $12 from another agent.
        daily: [{ period: DATE, totalCost: 42, totalTokens: 1200 }],
        weekly: [],
        monthly: [],
        session: [],
        totals: {},
        projects: [
          {
            project: "-Users-dev-demo",
            period: DATE,
            totalCost: 30,
            totalTokens: 900,
          },
        ],
      } as never,
    });
    const costs = Object.fromEntries(journal.sessions.map((session) => [session.id, session.totalCost]));
    // s1 produced 100 output tokens, s2 produced 200, so the $30 splits 1:2.
    expect(costs["claude:s1"]).toBeCloseTo(10);
    expect(costs["claude:s2"]).toBeCloseTo(20);
    expect(journal.projects[0].totalCost).toBe(30);
  });

  it("reports the day's cost across every agent, not just the projects it read", async () => {
    await writeSession("-Users-dev-demo", "s1", [assistant(at("01:00:00"))]);
    const journal = await read({
      report: {
        daily: [{ period: DATE, totalCost: 42, totalTokens: 1200 }],
        weekly: [],
        monthly: [],
        session: [],
        totals: {},
        projects: [{ project: "-Users-dev-demo", period: DATE, totalCost: 30, totalTokens: 900 }],
      } as never,
    });
    // Per-project spend is Claude-only, so the headline must come from the
    // all-agent daily row or the task list would understate the day.
    expect(journal.totalCost).toBe(42);
    expect(journal.totalTokens).toBe(1200);
  });

  it("falls back to the project sum when the day has no all-agent row", async () => {
    await writeSession("-Users-dev-demo", "s1", [assistant(at("01:00:00"))]);
    const journal = await read({
      report: {
        daily: [],
        weekly: [],
        monthly: [],
        session: [],
        totals: {},
        projects: [{ project: "-Users-dev-demo", period: DATE, totalCost: 30, totalTokens: 900 }],
      } as never,
    });
    expect(journal.totalCost).toBe(30);
  });

  it("leaves session cost null when ccusage has no row for the project", async () => {
    await writeSession("-Users-dev-demo", "s1", [assistant(at("01:00:00"))]);
    const journal = await read();
    expect(journal.sessions[0].totalCost).toBeNull();
  });

  it("clamps the idle threshold into a sane range", async () => {
    await writeSession("-Users-dev-demo", "s1", [assistant(at("01:00:00"))]);
    expect((await read({ idleMinutes: 0 })).idleMinutes).toBe(15);
    expect((await read({ idleMinutes: 9_000 })).idleMinutes).toBe(120);
  });
});
