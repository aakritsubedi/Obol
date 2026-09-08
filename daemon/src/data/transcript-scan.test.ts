import { appendFile, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter } from "../providers/claude.js";
import type { TranscriptFile } from "../providers/types.js";
import { TranscriptScanner } from "./transcript-scan.js";

const TZ = "UTC";
const DATE = "2026-08-25";

let root = "";
let path = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obol-scan-"));
  path = join(root, "session.jsonl");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const file = (): TranscriptFile => ({
  path,
  sessionId: "s1",
  projectDir: "-Users-dev-demo",
  isSubagent: false,
});

function assistant(time: string, tool: string, filePath?: string): string {
  return JSON.stringify({
    type: "assistant",
    timestamp: `${DATE}T${time}Z`,
    cwd: "/Users/dev/demo",
    message: {
      model: "claude-opus-5",
      usage: { output_tokens: 10 },
      content: [{ type: "tool_use", name: tool, input: filePath ? { file_path: filePath } : {} }],
    },
  });
}

const scan = (scanner: TranscriptScanner) => scanner.scan(claudeAdapter, file(), DATE, TZ);

/** The fields a journal actually reads back out of a scan. */
function shape(totals: Awaited<ReturnType<typeof scan>>) {
  return {
    timestamps: [...totals.session.timestamps].sort(),
    assistantTurns: totals.session.assistantTurns,
    toolCalls: totals.session.toolCalls,
    outputTokens: totals.session.outputTokens,
    projectPath: totals.session.projectPath,
    sessionFiles: [...totals.session.filesEdited].sort(),
    sessionTools: [...totals.session.toolMix.entries()].sort(),
    dayFiles: [...totals.day.filesEdited].sort(),
    dayTools: [...totals.day.toolMix.entries()].sort(),
  };
}

describe("TranscriptScanner", () => {
  it("resuming an appended transcript matches reading it cold", async () => {
    await writeFile(path, `${assistant("01:00:00", "Edit", "/a.ts")}\n`, "utf8");
    const warm = new TranscriptScanner();
    await scan(warm);

    await appendFile(path, `${assistant("02:00:00", "Bash")}\n`, "utf8");
    await appendFile(path, `${assistant("03:00:00", "Write", "/b.ts")}\n`, "utf8");

    const resumed = shape(await scan(warm));
    const cold = shape(await scan(new TranscriptScanner()));
    expect(resumed).toEqual(cold);
    expect(resumed.assistantTurns).toBe(3);
    expect(resumed.sessionFiles).toEqual(["/a.ts", "/b.ts"]);
  });

  // A live agent flushes a partial line. Consuming up to the file's end would
  // resume past the fragment and lose the record once it was completed.
  it("does not lose a record whose line was torn when first read", async () => {
    const complete = assistant("01:00:00", "Edit", "/a.ts");
    const torn = assistant("02:00:00", "Bash");
    const split = Math.floor(torn.length / 2);
    await writeFile(path, `${complete}\n${torn.slice(0, split)}`, "utf8");

    const warm = new TranscriptScanner();
    expect(shape(await scan(warm)).assistantTurns).toBe(1);

    await appendFile(path, `${torn.slice(split)}\n`, "utf8");
    const resumed = shape(await scan(warm));
    expect(resumed).toEqual(shape(await scan(new TranscriptScanner())));
    expect(resumed.assistantTurns).toBe(2);
  });

  it("re-reads from scratch when the transcript is truncated", async () => {
    await writeFile(
      path,
      `${assistant("01:00:00", "Edit", "/a.ts")}\n${assistant("02:00:00", "Bash")}\n`,
      "utf8",
    );
    const warm = new TranscriptScanner();
    expect(shape(await scan(warm)).assistantTurns).toBe(2);

    const replacement = `${assistant("04:00:00", "Read")}\n`;
    await truncate(path, 0);
    await writeFile(path, replacement, "utf8");

    const after = shape(await scan(warm));
    expect(after).toEqual(shape(await scan(new TranscriptScanner())));
    expect(after.assistantTurns).toBe(1);
  });

  it("re-reads when a transcript is rewritten to the same length", async () => {
    const original = `${assistant("01:00:00", "Edit", "/a.ts")}\n`;
    await writeFile(path, original, "utf8");
    const warm = new TranscriptScanner();
    expect(shape(await scan(warm)).sessionFiles).toEqual(["/a.ts"]);

    // Same byte count, different content: growth is the only thing a resume
    // can be built on, so this has to fall back to a full read.
    const replacement = `${assistant("01:00:00", "Edit", "/b.ts")}\n`;
    expect(replacement.length).toBe(original.length);
    await writeFile(path, replacement, "utf8");

    const after = shape(await scan(warm));
    expect(after).toEqual(shape(await scan(new TranscriptScanner())));
    expect(after.sessionFiles).toEqual(["/b.ts"]);
  });

  it("returns identical totals for an untouched transcript", async () => {
    await writeFile(path, `${assistant("01:00:00", "Edit", "/a.ts")}\n`, "utf8");
    const warm = new TranscriptScanner();
    const first = await scan(warm);
    const second = await scan(warm);
    // The same object: nothing was re-read, so nothing was rebuilt.
    expect(second).toBe(first);
  });

  it("counts a record once however many times the file is rescanned", async () => {
    await writeFile(path, `${assistant("01:00:00", "Bash")}\n`, "utf8");
    const warm = new TranscriptScanner();
    await scan(warm);
    await appendFile(path, `${assistant("02:00:00", "Bash")}\n`, "utf8");
    await scan(warm);
    const totals = await scan(warm);
    expect(totals.session.toolCalls).toBe(2);
    expect(totals.day.toolMix.get("Bash")).toBe(2);
  });

  it("keeps a multi-byte character whole across a resume", async () => {
    const first = JSON.stringify({
      type: "user",
      timestamp: `${DATE}T01:00:00Z`,
      origin: { kind: "human" },
      message: { content: "réservé — naïve ✅" },
    });
    await writeFile(path, `${first}\n`, "utf8");
    const warm = new TranscriptScanner();
    await scan(warm);
    const second = JSON.stringify({
      type: "user",
      timestamp: `${DATE}T02:00:00Z`,
      origin: { kind: "human" },
      message: { content: "日本語のテキスト" },
    });
    await appendFile(path, `${second}\n`, "utf8");

    const resumed = await scan(warm);
    expect(resumed.session.prompts).toEqual(["réservé — naïve ✅", "日本語のテキスト"]);
  });

  it("scopes totals per date so browsing history keeps today warm", async () => {
    await writeFile(path, `${assistant("01:00:00", "Edit", "/a.ts")}\n`, "utf8");
    const warm = new TranscriptScanner();
    const today = await scan(warm);
    expect(today.session.assistantTurns).toBe(1);

    const other = await warm.scan(claudeAdapter, file(), "2026-08-24", TZ);
    expect(other.session.assistantTurns).toBe(0);

    // Today's entry survived the other day's read rather than being replaced.
    expect(await scan(warm)).toBe(today);
  });

  it("drops transcripts the day no longer covers", async () => {
    await writeFile(path, `${assistant("01:00:00", "Bash")}\n`, "utf8");
    const warm = new TranscriptScanner();
    const first = await scan(warm);
    warm.retain(DATE, new Set());
    expect(await scan(warm)).not.toBe(first);
  });
});
