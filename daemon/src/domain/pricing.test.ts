import { describe, expect, it } from "vitest";
import { estimateCost } from "./pricing.js";

describe("estimateCost", () => {
  it("prices known models using normalized substring matching", () => {
    expect(estimateCost("openai/gpt-5-mini", 1_000_000)).toBeGreaterThan(0);
    expect(estimateCost("claude-haiku-4.5", 1_000_000)).toBeGreaterThan(0);
    expect(estimateCost("composer-2.5", 1_000_000)).toBeGreaterThan(0);
  });

  it("prefers the longest matching model key", () => {
    expect(estimateCost("gpt-5-mini", 1_000_000)).toBeLessThan(estimateCost("gpt-5", 1_000_000));
  });

  it("does not guess a price for unknown models", () => {
    expect(estimateCost("some-future-model", 1_000_000)).toBe(0);
  });
});
