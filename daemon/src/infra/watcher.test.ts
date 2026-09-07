import { describe, expect, it } from "vitest";
import { isUsageFilename } from "./watcher.js";

describe("isUsageFilename", () => {
  it("accepts transcript JSON files", () => {
    expect(isUsageFilename("projects/session.jsonl")).toBe(true);
    expect(isUsageFilename("chatSessions/session.json")).toBe(true);
  });

  // Cursor and OpenCode keep their usage in SQLite rather than transcripts, so
  // dropping the database itself would leave them updating only on the
  // five-minute fallback.
  it("accepts the provider databases themselves", () => {
    expect(isUsageFilename("state.vscdb")).toBe(true);
    expect(isUsageFilename("globalStorage/state.vscdb")).toBe(true);
    expect(isUsageFilename("opencode.db")).toBe(true);
  });

  it("rejects editor database churn and git metadata", () => {
    expect(isUsageFilename("globalStorage/state.vscdb-wal")).toBe(false);
    expect(isUsageFilename("globalStorage/state.vscdb-shm")).toBe(false);
    expect(isUsageFilename("data/app.db-wal")).toBe(false);
    expect(isUsageFilename("data/app.db-shm")).toBe(false);
    expect(isUsageFilename("data/app-journal")).toBe(false);
    expect(isUsageFilename("opencode.db-wal")).toBe(false);
    expect(isUsageFilename("project/.git/config.json")).toBe(false);
  });
});
