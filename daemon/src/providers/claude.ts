import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { asRecord, numberValue, stringValue } from "../types.js";
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

const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

export const claudeAdapter: ProviderAdapter = {
  id: "claude",

  root(): string {
    return process.env.OBOL_CLAUDE_ROOT || join(homedir(), ".claude", "projects");
  },

  async discover(root: string, sinceMs: number): Promise<TranscriptFile[]> {
    let projects: Dirent[];
    try {
      projects = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: TranscriptFile[] = [];
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const projectPath = join(root, project.name);
      let entries: Dirent[];
      try {
        entries = await readdir(projectPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push({
            path: join(projectPath, entry.name),
            sessionId: basename(entry.name, ".jsonl"),
            projectDir: project.name,
            isSubagent: false,
          });
          continue;
        }
        if (!entry.isDirectory()) continue;
        // Subagent transcripts replay their parent's work, so they carry the
        // parent's session id and never become a session of their own.
        const subagents = join(projectPath, entry.name, "subagents");
        let subagentEntries: Dirent[];
        try {
          subagentEntries = await readdir(subagents, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const subagent of subagentEntries) {
          if (!subagent.isFile() || !subagent.name.endsWith(".jsonl")) continue;
          files.push({
            path: join(subagents, subagent.name),
            sessionId: entry.name,
            projectDir: project.name,
            isSubagent: true,
          });
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

  meta(record, session, file): void {
    // ai-title carries no timestamp and is rewritten as a session goes on, so
    // it is read outside the day filter and the last one wins.
    if (record.type === "ai-title" && !file.isSubagent) {
      const title = stringValue(record.aiTitle).trim();
      if (title) session.title = title;
    }
  },

  consume(record, session, day, file): void {
    // The first cwd is the directory the session opened in; later records can
    // report a subdirectory, which would otherwise rename the project.
    const cwd = stringValue(record.cwd).trim();
    if (cwd && !file.isSubagent && !session.projectPath) session.projectPath = cwd;
    const branch = stringValue(record.gitBranch).trim();
    if (branch && !file.isSubagent) session.gitBranch = branch;

    const message = asRecord(record.message);
    const content = Array.isArray(message.content) ? message.content : [];

    if (record.type === "assistant") {
      session.assistantTurns += 1;
      const model = stringValue(message.model).trim();
      if (model) session.models.add(model);
      session.outputTokens += numberValue(asRecord(message.usage).output_tokens);
      for (const part of content) {
        const block = asRecord(part);
        if (block.type !== "tool_use") continue;
        const name = stringValue(block.name, "unknown");
        countTool(session, day, name);
        const input = asRecord(block.input);
        if (EDIT_TOOLS.has(name)) {
          recordFile(session, day, stringValue(input.file_path ?? input.notebook_path));
        }
        if (name === "Bash" && TEST_COMMAND.test(stringValue(input.command))) day.testRuns += 1;
      }
      return;
    }

    // Most type:"user" records are tool results being fed back in. Only an
    // explicitly human-origin record is a prompt the person actually typed.
    if (record.type === "user" && !file.isSubagent && record.isSidechain !== true) {
      if (stringValue(asRecord(record.origin).kind) === "human") {
        addPrompt(session, promptText(message.content));
      }
    }
  },
};

// A transcript's mtime can only be at or after its last record, so a file
// untouched since before the window opened cannot hold records inside it. This
// is what keeps the walk cheap against a multi-hundred-megabyte tree.
export async function keepRecent(files: TranscriptFile[], sinceMs: number): Promise<TranscriptFile[]> {
  const recent: TranscriptFile[] = [];
  for (const file of files) {
    try {
      if ((await stat(file.path)).mtimeMs >= sinceMs) recent.push(file);
    } catch {
      // The transcript disappeared between the listing and the stat.
    }
  }
  return recent;
}
