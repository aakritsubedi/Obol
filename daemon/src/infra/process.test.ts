import { describe, expect, it } from "vitest";
import { historyWindow, projectArgs, reportArgs } from "./process.js";

const UTC = "UTC";
const NOW = new Date("2026-09-08T10:00:00Z");

describe("historyWindow", () => {
  it("spans historyDays inclusive of today", () => {
    expect(historyWindow(90, NOW, UTC)).toEqual({ since: "2026-06-11", until: "2026-09-08" });
  });

  it("defaults to 90 days when the config says nothing", () => {
    expect(historyWindow(undefined, NOW, UTC)).toEqual(historyWindow(90, NOW, UTC));
  });

  it("clamps a window the config cannot support", () => {
    expect(historyWindow(1, NOW, UTC).since).toBe(historyWindow(7, NOW, UTC).since);
    expect(historyWindow(10_000, NOW, UTC).since).toBe(historyWindow(365, NOW, UTC).since);
  });
});

describe("ccusage arguments", () => {
  const window = { since: "2026-06-11", until: "2026-09-08" };

  // The daemon reprices every row it can from its own table, so ccusage's own
  // pricing fetch is work whose result is thrown away. Losing the flag would
  // quietly put a network round trip back on every refresh.
  it("keeps both calls offline", () => {
    expect(reportArgs(window, UTC)).toContain("--offline");
    expect(projectArgs(window, UTC)).toContain("--offline");
  });

  it("asks for the sections the dashboard renders", () => {
    const args = reportArgs(window, UTC);
    expect(args).toContain("--by-agent");
    expect(args[args.indexOf("--sections") + 1]).toBe("daily,weekly,monthly");
  });

  it("passes the window and timezone through to both calls", () => {
    for (const args of [reportArgs(window, "Asia/Kathmandu"), projectArgs(window, "Asia/Kathmandu")]) {
      expect(args[args.indexOf("-z") + 1]).toBe("Asia/Kathmandu");
      expect(args[args.indexOf("--since") + 1]).toBe("2026-06-11");
      expect(args[args.indexOf("--until") + 1]).toBe("2026-09-08");
    }
  });

  it("keeps the projects call scoped to claude instances", () => {
    expect(projectArgs(window, UTC).slice(0, 3)).toEqual(["claude", "daily", "--instances"]);
  });
});
