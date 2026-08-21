import { describe, expect, it, vi } from "vitest";
import {
  displayName,
  formatCurrency,
  formatDuration,
  formatPercent,
  formatPeriod,
  formatRelativeTime,
  formatSignedCurrency,
  formatTokens,
  formatUpdatedAt,
  numberValue,
  projectName,
} from "./format";

describe("numberValue", () => {
  it("passes numbers through and parses numeric strings", () => {
    expect(numberValue(4.2)).toBe(4.2);
    expect(numberValue("12.5")).toBe(12.5);
    expect(numberValue("")).toBe(0);
  });

  it("falls back to zero for non-finite input", () => {
    expect(numberValue(undefined)).toBe(0);
    expect(numberValue(null)).toBe(0);
    expect(numberValue("abc")).toBe(0);
    expect(numberValue(Number.NaN)).toBe(0);
    expect(numberValue(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats USD with two decimals", () => {
    expect(formatCurrency(1234.5, "en-US")).toBe("$1,234.50");
    expect(formatCurrency(0, "en-US")).toBe("$0.00");
  });

  it("coerces junk to zero", () => {
    expect(formatCurrency(undefined, "en-US")).toBe("$0.00");
  });
});

describe("formatSignedCurrency", () => {
  it("signs positive and negative deltas", () => {
    expect(formatSignedCurrency(3.25, "en-US")).toBe("+$3.25");
    expect(formatSignedCurrency(-3.25, "en-US")).toBe("−$3.25");
  });
});

describe("formatPercent", () => {
  it("formats ratios as signed percentages", () => {
    expect(formatPercent(0.8042, 2, "en-US")).toBe("+80.42%");
    expect(formatPercent(-0.5, 1, "en-US")).toBe("−50.0%");
  });
});

describe("formatTokens", () => {
  it("scales to K, M, and B", () => {
    expect(formatTokens(999, "en-US")).toBe("999");
    expect(formatTokens(1500, "en-US")).toBe("1.5K");
    expect(formatTokens(2_500_000, "en-US")).toBe("2.5M");
    expect(formatTokens(3_400_000_000, "en-US")).toBe("3.4B");
  });

  it("handles junk", () => {
    expect(formatTokens(null, "en-US")).toBe("0");
  });
});

describe("formatDuration", () => {
  it("renders minutes and hours", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(135)).toBe("2h 15m");
  });

  it("clamps negatives to zero", () => {
    expect(formatDuration(-5)).toBe("0m");
  });
});

describe("formatPeriod", () => {
  it("formats daily and monthly period keys", () => {
    expect(formatPeriod("2026-08-21", "en-US")).toBe("Aug 21");
    expect(formatPeriod("2026-08", "en-US")).toBe("Aug 1");
  });

  it("passes through invalid input", () => {
    expect(formatPeriod("", "en-US")).toBe("—");
    expect(formatPeriod("not-a-date", "en-US")).toBe("not-a-date");
  });
});

describe("displayName", () => {
  it("title-cases dashed names", () => {
    expect(displayName("claude-code")).toBe("Claude Code");
    expect(displayName("openai_codex")).toBe("Openai Codex");
  });

  it("falls back when empty", () => {
    expect(displayName("", "Unknown")).toBe("Unknown");
    expect(displayName(null)).toBe("Unknown");
  });
});

describe("projectName", () => {
  it("uses the last path piece of a project slug", () => {
    expect(projectName("-Users-dev-Work-my-app")).toBe("App");
  });

  it("falls back for empty slugs", () => {
    expect(projectName("")).toBe("Unknown project");
  });
});

describe("formatRelativeTime", () => {
  it("describes recent deltas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));
    try {
      expect(formatRelativeTime("2026-08-21T11:59:45Z")).toBe("just now");
      expect(formatRelativeTime("2026-08-21T11:55:00Z")).toBe("5m ago");
      expect(formatRelativeTime("2026-08-21T10:00:00Z")).toBe("2h ago");
      expect(formatRelativeTime("2026-08-18T12:00:00Z")).toBe("3d ago");
      expect(formatRelativeTime("2026-08-21T12:05:00Z")).toBe("in 5m");
      expect(formatRelativeTime("2026-08-21T15:00:00Z")).toBe("in 3h");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports missing or unreadable values as no activity", () => {
    expect(formatRelativeTime(null)).toBe("No activity");
    expect(formatRelativeTime("garbage")).toBe("No activity");
  });
});

describe("formatUpdatedAt", () => {
  it("formats timestamps and handles missing input", () => {
    // Parsed as UTC but rendered in the machine's zone, so only assert shape.
    expect(formatUpdatedAt("2026-08-21T09:05:00Z", "en-US")).toMatch(/Aug \d{1,2}, \d{1,2}:\d{2}/);
    expect(formatUpdatedAt(null)).toBe("Waiting for usage");
    expect(formatUpdatedAt("nope")).toBe("Waiting for usage");
  });
});
