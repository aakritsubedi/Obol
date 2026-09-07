import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../data/config-store.js";
import { SnapshotStore } from "../data/snapshot-store.js";
import { emptyReport } from "../domain/factories.js";
import type { ProviderAdapter } from "../providers/types.js";
import { UsageService } from "./UsageService.js";

const NOW = new Date("2026-08-25T10:00:00Z");
const time = { now: () => NOW, timeZone: () => "UTC" };

// A provider ccusage cannot read: it reports the same day's tokens every time,
// exactly as a real adapter re-reading unchanged files on disk would.
const localProvider: ProviderAdapter = {
  id: "copilot",
  root: () => "/nowhere",
  discover: async () => [],
  timestampOf: () => null,
  consume: () => {},
  usage: async () => [
    {
      date: "2026-08-25",
      model: "gpt-5-mini",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
  ],
};

const { runUsage } = vi.hoisted(() => ({ runUsage: vi.fn() }));
vi.mock("../infra/process.js", () => ({ runUsage }));

let directory = "";
let store: SnapshotStore;

function service(): UsageService {
  return new UsageService({
    getConfig: () => DEFAULT_CONFIG,
    getLiveReport: () => emptyReport(),
    setLiveReport: () => {},
    store,
    onChanged: () => {},
    providers: [localProvider],
    time,
  });
}

const copilotCost = (): number =>
  store
    .get()
    .report.daily.flatMap((row) => row.agents)
    .filter((agent) => agent.agent === "copilot")
    .reduce((total, agent) => total + Number(agent.totalCost ?? 0), 0);

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "obol-usage-"));
  store = new SnapshotStore(join(directory, "snapshot.json"), DEFAULT_CONFIG, time);
  runUsage.mockReset();
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("UsageService", () => {
  it("prices local-provider usage into the stored report", async () => {
    runUsage.mockResolvedValue({ report: emptyReport(), fullReport: null, blocks: null, errors: [] });
    await service().refreshNow();
    expect(copilotCost()).toBeGreaterThan(0);
  });

  // The stored snapshot already contains the last merge. Folding the same rows
  // in again once ccusage starts failing would inflate spend on every refresh.
  it("keeps the stored total steady when ccusage stops responding", async () => {
    runUsage.mockResolvedValue({ report: emptyReport(), fullReport: null, blocks: null, errors: [] });
    const usage = service();
    await usage.refreshNow();
    const afterFirst = copilotCost();

    runUsage.mockResolvedValue({
      report: null,
      fullReport: null,
      blocks: null,
      errors: ["ccusage timed out"],
    });
    await usage.refreshNow();
    await usage.refreshNow();

    expect(copilotCost()).toBe(afterFirst);
  });
});
