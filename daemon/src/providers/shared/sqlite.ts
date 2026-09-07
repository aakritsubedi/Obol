import { spawn } from "node:child_process";

export interface SqlRow {
  [column: string]: unknown;
}

class BinaryMissing extends Error {}

const QUERY_TIMEOUT_MS = 10_000;
let sqliteCandidates = ["/usr/bin/sqlite3", "sqlite3"];

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
export async function query(database: string, sql: string): Promise<SqlRow[] | null> {
  let missing = false;
  for (const binary of [...sqliteCandidates]) {
    try {
      return await runQuery(binary, database, sql);
    } catch (error) {
      if (error instanceof BinaryMissing) {
        sqliteCandidates = sqliteCandidates.filter((candidate) => candidate !== binary);
        missing = true;
        continue;
      }
      return null;
    }
  }
  return missing ? null : [];
}
