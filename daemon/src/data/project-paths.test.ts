import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectProjectPaths } from "./project-paths.js";
import { claudeAdapter } from "../providers/claude.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obol-project-paths-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeSession(
  slug: string,
  id: string,
  cwd: string,
  timestamp = "2026-08-25T01:00:00Z",
): Promise<void> {
  const directory = join(root, slug);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${id}.jsonl`),
    `${JSON.stringify({
      type: "assistant",
      timestamp,
      cwd,
      message: { model: "claude-opus-5", usage: { output_tokens: 1 }, content: [] },
    })}\n`,
    "utf8",
  );
}

describe("collectProjectPaths", () => {
  it("reads the real cwd from Claude transcripts keyed by project slug", async () => {
    await writeSession("-Users-dev-dolpo.ai", "s1", "/Users/dev/dolpo.ai");
    await writeSession("-Users-dev-learning-rag", "s1", "/Users/dev/learning-rag");

    const paths = await collectProjectPaths([{ ...claudeAdapter, root: () => root }], 0);

    expect(paths["-Users-dev-dolpo.ai"]).toBe("/Users/dev/dolpo.ai");
    expect(paths["-Users-dev-learning-rag"]).toBe("/Users/dev/learning-rag");
  });

  it("tries another session in the same slug when the first carries no cwd", async () => {
    const slug = "-Users-dev-demo";
    const directory = join(root, slug);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "empty.jsonl"),
      `${JSON.stringify({ type: "ai-title", aiTitle: "Draft" })}\n`,
      "utf8",
    );
    await writeSession(slug, "with-cwd", "/Users/dev/demo");

    const paths = await collectProjectPaths([{ ...claudeAdapter, root: () => root }], 0);

    expect(paths[slug]).toBe("/Users/dev/demo");
  });
});
