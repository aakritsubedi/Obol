import { describe, expect, it } from "vitest";
import { estimateCost, priceFor } from "./pricing.js";

const million = {
  inputTokens: 1_000_000,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

describe("estimateCost", () => {
  it("prices known models using normalized substring matching", () => {
    expect(estimateCost("openai/gpt-5-mini", million)).toBeGreaterThan(0);
    expect(estimateCost("claude-haiku-4.5", million)).toBeGreaterThan(0);
    expect(estimateCost("composer-2.5", million)).toBeGreaterThan(0);
  });

  it("prices Composer 2.5 standard at Cursor's list rates", () => {
    expect(estimateCost("composer-2.5", million)).toBe(0.5);
    expect(
      estimateCost("composer-2.5", { ...million, inputTokens: 0, outputTokens: 1_000_000 }),
    ).toBe(2.5);
  });

  it("prices Composer 2.5 Fast higher than standard", () => {
    expect(estimateCost("composer-2.5-fast", million)).toBe(3);
    expect(
      estimateCost("composer-2.5-fast", { ...million, inputTokens: 0, outputTokens: 1_000_000 }),
    ).toBe(15);
    expect(estimateCost("composer-2.5-fast", million)).toBeGreaterThan(estimateCost("composer-2.5", million));
  });

  it("prefers the longest matching model key", () => {
    expect(estimateCost("gpt-5-mini", million)).toBeLessThan(estimateCost("gpt-5", million));
  });

  it("does not guess a price for unknown models", () => {
    expect(estimateCost("some-future-model", million)).toBe(0);
    expect(priceFor("some-future-model")).toBeNull();
  });

  it("charges output at its own rate rather than blending it with input", () => {
    const input = estimateCost("gpt-5", million);
    const output = estimateCost("gpt-5", { ...million, inputTokens: 0, outputTokens: 1_000_000 });
    expect(output).toBeGreaterThan(input);
  });

  it("charges a cache read far less than fresh input", () => {
    const input = estimateCost("claude-haiku-4.5", million);
    const cached = estimateCost("claude-haiku-4.5", {
      ...million,
      inputTokens: 0,
      cacheReadTokens: 1_000_000,
    });
    expect(cached).toBeLessThan(input);
  });
});
