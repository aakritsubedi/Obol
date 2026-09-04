import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { asRecord, numberValue, stringValue } from "../shared/coerce.js";
import {
  addPrompt,
  countTool,
  type ProviderAdapter,
  promptText,
  recordFile,
  TEST_COMMAND,
  type TranscriptFile,
} from "./types.js";

// OpenCode keeps every session in one SQLite database rather than per-session
// transcript files: sessions in `session`, turns in `message`, and the content
// of a turn — text, tool calls, applied patches — in `part` rows beneath it.
// The sqlite3 CLI ships with macOS, so the daemon talks to the database through
// it instead of taking on a native driver.
const DATABASE = "opencode.db";

// Prefer the absolute macOS path: a developer's PATH often carries another
// sqlite3 first (homebrew, android platform-tools) whose build may vary.
let SQLITE_CANDIDATES = ["/usr/bin/sqlite3", "sqlite3"];
const QUERY_TIMEOUT_MS = 10_000;

interface SqlRow {
  [column: string]: unknown;
}

class BinaryMissing extends Error {}

function runQuery(binary: string, database: string, sql: string): Promise<SqlRow[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["-readonly", "-json", database, sql], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), QUERY_TIMEOUT_MS);
    child.stdout.on("data", (chunk: string) => stdout.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new BinaryMissing(binary));
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // A non-zero exit means the database is missing, locked or was migrated
      // away under us — "no data", not "wrong binary".
      if (code !== 0) {
        resolve([]);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout.join("") || "[]");
        resolve(Array.isArray(parsed) ? (parsed as SqlRow[]) : []);
      } catch {
        resolve([]);
      }
    });
  });
}

// Tries each candidate once, dropping the ones that do not exist. Returns null
// when no sqlite3 could run at all, so callers can tell "no agent data" from
// "nothing answered".
async function query(database: string, sql: string): Promise<SqlRow[] | null> {
  let missing = false;
  for (const binary of [...SQLITE_CANDIDATES]) {
    try {
      return await runQuery(binary, database, sql);
    } catch (error) {
      if (error instanceof BinaryMissing) {
        SQLITE_CANDIDATES = SQLITE_CANDIDATES.filter((candidate) => candidate !== binary);
        missing = true;
        continue;
      }
      return null;
    }
  }
  return missing ? null : [];
}

// OpenCode marks subagent runs with a parent_id; their work replays inside the
// parent conversation, so it is attributed there and never surfaces as a
// session of its own — the same rule Claude transcripts follow.
const SESSIONS_SQL = (sinceMs: number): string =>
  `SELECT id, parent_id, directory FROM session ` +
  `WHERE time_archived IS NULL AND time_updated >= ${Math.max(0, Math.floor(sinceMs))} ` +
  `ORDER BY time_updated`;

// One pass yields the session's turns and their parts interleaved by time, with
// the parent session's identity joined onto every row. Message ids ride along
// so a part can find whether the turn it belongs to was the person or the
// model. Children of the session are included; `sid` tells them apart later.
const RECORDS_SQL = (sessionId: string): string => {
  const quoted = sessionId.replace(/'/g, "''");
  const scope = `(SELECT '${quoted}' UNION SELECT id FROM session WHERE parent_id = '${quoted}')`;
  const identity = `(SELECT title, directory FROM session WHERE id = '${quoted}')`;
  return (
    `SELECT 'message' AS kind, m.session_id AS sid, m.id AS mid, m.time_created AS time, ` +
    `m.data AS data, ps.title AS title, ps.directory AS directory ` +
    `FROM message m LEFT JOIN ${identity} ps ON 1 = 1 WHERE m.session_id IN ${scope} ` +
    `UNION ALL ` +
    `SELECT 'part', p.session_id, p.message_id, p.time_created, p.data, ps.title, ps.directory ` +
    `FROM part p LEFT JOIN ${identity} ps ON 1 = 1 WHERE p.session_id IN ${scope} ` +
    `ORDER BY time`
  );
};

// OpenCode names tools in lower case (bash, edit, glob); everything else in the
// journal uses Claude's capitalisation, so the mix stays comparable across
// agents. Only the multi-word names need an explicit mapping.
const TOOL_NAMES: Record<string, string> = { webfetch: "WebFetch", todowrite: "TodoWrite" };

function toolName(raw: string): string {
  return TOOL_NAMES[raw] ?? raw.replace(/^./, (character) => character.toUpperCase());
}

const EDIT_TOOLS = new Set(["edit", "write"]);

export const opencodeAdapter: ProviderAdapter = {
  id: "opencode",

  root(): string {
    return process.env.OBOL_OPENCODE_ROOT || join(homedir(), ".local", "share", "opencode");
  },

  async discover(root: string, sinceMs: number): Promise<TranscriptFile[]> {
    const database = join(root, DATABASE);
    const rows = await query(database, SESSIONS_SQL(sinceMs));
    if (!rows) return [];

    // A child run is only folded into its parent when the parent itself is
    // being read; an orphan whose parent fell outside the window still gets
    // its own transcript so the work is not lost.
    const discovered = new Set<string>();
    for (const row of rows) {
      const id = stringValue(row.id).trim();
      if (id) discovered.add(id);
    }

    const files: TranscriptFile[] = [];
    for (const row of rows) {
      const id = stringValue(row.id).trim();
      if (!id) continue;
      const parent = stringValue(row.parent_id).trim();
      if (parent && discovered.has(parent)) continue;
      // Project grouping keys off the working directory; slugging it the way
      // Claude Code does (separators replaced by dashes) means work done on
      // the same checkout through both agents lands under one project.
      const directory = stringValue(row.directory).trim();
      files.push({
        path: database,
        sessionId: parent || id,
        projectDir: directory.replace(/\//g, "-"),
        isSubagent: false,
      });
    }
    return files;
  },

  async *read(file: TranscriptFile): AsyncIterable<Record<string, unknown>> {
    const rows = await query(file.path, RECORDS_SQL(file.sessionId));
    if (!rows) return;

    // Rows arrive in time order, and a turn is always created before its
    // parts, so by the time a part shows up its turn's role is known.
    const roleOfTurn = new Map<string, string>();
    for (const row of rows) {
      const time = numberValue(row.time);
      if (time <= 0) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(stringValue(row.data));
      } catch {
        continue;
      }
      const data = asRecord(payload);
      const shared = {
        kind: stringValue(row.kind),
        time,
        title: stringValue(row.title).trim(),
        directory: stringValue(row.directory).trim(),
        // Work replayed from a child run is the agent talking to itself; only
        // rows belonging to the session proper can carry a human prompt.
        child: row.sid !== file.sessionId,
      };

      if (shared.kind === "message") {
        const turnId = stringValue(row.mid);
        if (turnId) roleOfTurn.set(turnId, stringValue(data.role));
        yield { ...data, ...shared };
        continue;
      }

      yield {
        ...data,
        ...shared,
        role: roleOfTurn.get(stringValue(row.mid)) ?? "",
      };
    }
  },

  timestampOf(record: Record<string, unknown>): number | null {
    const value = numberValue(record.time, 0);
    return value > 0 ? value : null;
  },

  consume(record, session, day): void {
    // The session's own directory outranks a turn-level cwd, which drifts when
    // work moves into a subdirectory.
    if (!session.projectPath) {
      session.projectPath = stringValue(record.directory).trim();
    }

    const kind = stringValue(record.kind);
    if (kind === "message") {
      if (stringValue(record.title)) session.title = stringValue(record.title);
      if (stringValue(record.role) !== "assistant") return;
      session.assistantTurns += 1;
      const model = stringValue(record.modelID).trim();
      if (model) session.models.add(model);
      session.outputTokens += numberValue(asRecord(record.tokens).output);
      return;
    }

    const type = stringValue(record.type);

    // A person's request is the text of a user turn; everything else flowing
    // through text parts is the model narrating.
    if (type === "text") {
      if (stringValue(record.role) === "user" && !record.child) {
        addPrompt(session, promptText(stringValue(record.text)));
      }
      return;
    }

    if (type === "tool") {
      const name = toolName(stringValue(record.tool, "unknown"));
      countTool(session, day, name);
      const input = asRecord(asRecord(record.state).input);
      if (EDIT_TOOLS.has(stringValue(record.tool))) {
        recordFile(session, day, stringValue(input.filePath));
      }
      if (name === "Bash" && TEST_COMMAND.test(stringValue(input.command))) day.testRuns += 1;
      return;
    }

    // A patch row lists every file an apply-style change touched, including
    // edits made outside the edit tool.
    if (type === "patch" && Array.isArray(record.files)) {
      for (const path of record.files) recordFile(session, day, String(path));
    }
  },
};
