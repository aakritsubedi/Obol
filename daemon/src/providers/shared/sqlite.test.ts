import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "./sqlite.js";

let root = "";
let database = "";

function sqlite(sql: string): void {
  execFileSync("sqlite3", [database, sql], { stdio: ["ignore", "ignore", "ignore"] });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obol-sqlite-"));
  database = join(root, "state.vscdb");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("query", () => {
  it("returns rows keyed by column name", async () => {
    sqlite(
      "CREATE TABLE kv (key TEXT, value TEXT, n INTEGER);" +
        "INSERT INTO kv VALUES ('a', '{\"x\":1}', 7), ('b', NULL, 0);",
    );
    expect(await query(database, "SELECT key, value, n FROM kv ORDER BY key")).toEqual([
      { key: "a", value: '{"x":1}', n: "7" },
      // A NULL reads back as empty, which `stringValue`/`numberValue` coerce
      // exactly as they coerced the nulls the JSON output mode produced.
      { key: "b", value: "", n: "0" },
    ]);
  });

  it("returns no rows for an empty result rather than a malformed one", async () => {
    sqlite("CREATE TABLE kv (key TEXT);");
    expect(await query(database, "SELECT key FROM kv")).toEqual([]);
  });

  // The bug this guards: sqlite3's `-json` output mode escapes a text value in
  // time proportional to its length times the number of characters needing an
  // escape, so a single cell holding a day's Cursor conversation — hundreds of
  // kilobytes of JSON, a tenth of it quote characters — took longer to print
  // than the query timeout allowed. The read was killed and came back empty,
  // and the largest session of the day silently counted as zero.
  it("reads a quote-dense value the size of a day's conversation without stalling", async () => {
    sqlite(
      "CREATE TABLE kv (key TEXT, value TEXT);" +
        // 70,000 copies of a small JSON object: ~630KB, ~280,000 quotes.
        "INSERT INTO kv VALUES ('big', replace(hex(zeroblob(70000)), '00', '{\"k\":\"v\"}'));",
    );
    const started = Date.now();
    const rows = await query(database, "SELECT length(value) AS n, value FROM kv");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(rows).toHaveLength(1);
    const row = rows?.[0];
    expect(Number(row?.n)).toBeGreaterThan(600_000);
    expect(String(row?.value)).toHaveLength(Number(row?.n));
  });

  it("reports an unreadable database as nothing answered, not as no rows", async () => {
    expect(await query(join(root, "missing.vscdb"), "SELECT 1")).toBeNull();
  });
});
