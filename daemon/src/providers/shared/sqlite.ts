import { spawn } from "node:child_process";

export interface SqlRow {
  [column: string]: unknown;
}

class BinaryMissing extends Error {}

// Generous, because it is now only a guard against a wedged process rather than
// a limit any real query approaches: the sizes that used to blow through ten
// seconds now answer in milliseconds.
const QUERY_TIMEOUT_MS = 30_000;
let sqliteCandidates = ["/usr/bin/sqlite3", "sqlite3"];

// ASCII's record and unit separators, which is what `-ascii` mode delimits with.
const RECORD_SEPARATOR = "\x1e";
const UNIT_SEPARATOR = "\x1f";

/**
 * Parses `-ascii` output: a header record of column names, then one record per
 * row, fields delimited by the two control characters reserved for the job.
 *
 * `-json` cannot be used here. The sqlite3 shell escapes each text value into
 * JSON quadratically, and these tables hold whole conversations in a single
 * cell — a 700KB Cursor composer, an ordinary size after a day's work, took 13
 * seconds to print where the rest of the query took 10 milliseconds. Past the
 * query timeout the shell was killed and the read came back empty, which is
 * indistinguishable from a conversation that cost nothing: the largest session
 * of the day silently stopped counting, and the day's total fell as it grew.
 * `-ascii` writes values raw, so the same read is linear in their size.
 *
 * Every column arrives as a string and a NULL as an empty string. Callers
 * coerce through `numberValue`/`stringValue`, which read those the same way
 * they read the numbers and nulls the JSON mode used to produce. The values
 * themselves are JSON documents and identifiers, neither of which can contain a
 * raw separator — JSON escapes control characters.
 */
function parseAscii(output: string): SqlRow[] {
  const records = output.split(RECORD_SEPARATOR);
  // Every record is terminated rather than separated, so the split leaves a
  // trailing empty one.
  if (records[records.length - 1] === "") records.pop();
  const header = records.shift();
  // No header at all means no rows: the shell prints column names with the
  // first row, not before it.
  if (header === undefined) return [];
  const columns = header.split(UNIT_SEPARATOR);
  return records.map((record) => {
    const fields = record.split(UNIT_SEPARATOR);
    const row: SqlRow = {};
    columns.forEach((column, index) => {
      row[column] = fields[index] ?? "";
    });
    return row;
  });
}

function runQuery(binary: string, database: string, sql: string): Promise<SqlRow[] | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["-readonly", "-ascii", "-header", database, sql], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    // Decoded by the stream rather than per chunk, so a multi-byte character
    // split across a chunk boundary is not turned into replacement characters.
    child.stdout.setEncoding("utf8");
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, QUERY_TIMEOUT_MS);
    child.stdout.on("data", (chunk: string) => stdout.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new BinaryMissing(binary));
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // A killed or failed read is not an empty one. Reporting it as no rows is
      // what let a timeout read back as a conversation that used nothing, so it
      // resolves null — the same "nothing answered" callers already handle.
      if (timedOut || code !== 0) {
        resolve(null);
        return;
      }
      resolve(parseAscii(stdout.join("")));
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
