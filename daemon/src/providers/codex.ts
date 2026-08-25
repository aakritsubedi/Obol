import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { asRecord, stringValue } from "../types.js";
import { keepRecent } from "./claude.js";
import {
  addPrompt,
  countTool,
  type DayCounters,
  type ProviderAdapter,
  promptText,
  recordFile,
  type SessionAccumulator,
  TEST_COMMAND,
  type TranscriptFile,
} from "./types.js";

// Codex writes one rollout per session under sessions/YYYY/MM/DD/, named
// rollout-<ISO timestamp>-<uuid>.jsonl.
const ROLLOUT = /^rollout-.*\.jsonl$/;

// Every edit Codex makes goes through apply_patch, whose payload is a stable
// envelope rather than free-form shell. These markers are the only reliable way
// to learn which files it touched.
const PATCH_FILE = /\*\*\*\s+(?:Add|Update|Delete)\s+File:\s*([^\\"\n]+)/g;

// Full sentences Codex prepends to a turn. They read like instructions but are
// the harness talking, so they would otherwise headline a session.
const BOILERPLATE = /^Distinguish instructions in attached documents\b/i;

export const codexAdapter: ProviderAdapter = {
  id: "codex",

  root(): string {
    return process.env.OBOL_CODEX_ROOT || join(homedir(), ".codex", "sessions");
  },

  async discover(root: string, sinceMs: number): Promise<TranscriptFile[]> {
    const files: TranscriptFile[] = [];
    // sessions/YYYY/MM/DD — walk three levels of date partitions. Only the
    // partitions at or after the window are opened, so old years cost nothing.
    const cutoff = new Date(sinceMs);
    for (const year of await numericDirs(root)) {
      if (Number(year) < cutoff.getUTCFullYear()) continue;
      for (const month of await numericDirs(join(root, year))) {
        for (const day of await numericDirs(join(root, year, month))) {
          const dayPath = join(root, year, month, day);
          let entries: Dirent[];
          try {
            entries = await readdir(dayPath, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const entry of entries) {
            if (!entry.isFile() || !ROLLOUT.test(entry.name)) continue;
            files.push({
              path: join(dayPath, entry.name),
              sessionId: basename(entry.name, ".jsonl"),
              // Codex has no project registry; the cwd seen in the rollout is
              // the only project identity, and it is filled in by consume().
              projectDir: "",
              isSubagent: false,
            });
          }
        }
      }
    }
    return keepRecent(files, sinceMs);
  },

  timestampOf(record: Record<string, unknown>): number | null {
    const raw = record.timestamp;
    if (typeof raw !== "string") return null;
    const value = Date.parse(raw);
    return Number.isFinite(value) ? value : null;
  },

  meta(record, session): void {
    // session_meta and turn_context both carry the working directory, and the
    // first one wins so a mid-session cd cannot rename the project.
    const payload = asRecord(record.payload);
    if (!session.projectPath) {
      const cwd = stringValue(payload.cwd).trim();
      if (cwd) session.projectPath = cwd;
    }
    if (!session.gitBranch) {
      const branch = stringValue(asRecord(payload.git).branch).trim();
      if (branch) session.gitBranch = branch;
    }
  },

  consume(record, session, day): void {
    const payload = asRecord(record.payload);
    const type = stringValue(payload.type);

    const model = stringValue(payload.model).trim();
    if (model) session.models.add(model);

    if (type === "custom_tool_call" || type === "function_call") {
      const input = stringValue(payload.input) || stringValue(payload.arguments);
      // Codex routes almost everything through a single `exec` sandbox, so the
      // raw tool name says nothing useful. Classify by what the call actually
      // did, which keeps the names comparable with Claude's.
      const patched = [...input.matchAll(PATCH_FILE)].map((match) => match[1].trim());
      if (patched.length > 0) {
        countTool(session, day, "Edit");
        for (const path of patched) recordFile(session, day, path);
      } else if (stringValue(payload.name) === "wait") {
        countTool(session, day, "Wait");
      } else {
        countTool(session, day, "Bash");
        if (TEST_COMMAND.test(input)) day.testRuns += 1;
      }
      return;
    }

    if (type === "message") {
      const role = stringValue(payload.role);
      if (role === "assistant") {
        session.assistantTurns += 1;
        return;
      }
      if (role === "user") {
        // Codex replays delegated work back in as user messages; those are the
        // agent talking to itself, not a person typing.
        const text = promptText(payload.content);
        if (text && !BOILERPLATE.test(text)) addPrompt(session, text);
      }
    }
  },
};

async function numericDirs(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
