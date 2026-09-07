import { describe, expect, it } from "vitest";
import { splitCachedPrompt } from "./prompt-cache.js";

describe("splitCachedPrompt", () => {
  it("writes the whole first prompt into the cache", () => {
    expect(splitCachedPrompt(1_000, 0)).toEqual({
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 1_000,
    });
  });

  it("reads back the prefix and charges only the growth", () => {
    expect(splitCachedPrompt(1_200, 1_000)).toEqual({
      inputTokens: 200,
      cacheReadTokens: 1_000,
      cacheCreationTokens: 0,
    });
  });

  it("charges nothing fresh when the prompt did not grow", () => {
    expect(splitCachedPrompt(1_000, 1_000)).toEqual({
      inputTokens: 0,
      cacheReadTokens: 1_000,
      cacheCreationTokens: 0,
    });
  });

  it("treats a compacted prompt as entirely cached", () => {
    expect(splitCachedPrompt(400, 1_000)).toEqual({
      inputTokens: 0,
      cacheReadTokens: 400,
      cacheCreationTokens: 0,
    });
  });

  it("preserves the token total across the split", () => {
    for (const [prompt, previous] of [
      [0, 0],
      [50, 0],
      [10_000, 9_000],
      [7, 7],
      [3, 900],
    ]) {
      const split = splitCachedPrompt(prompt, previous);
      expect(split.inputTokens + split.cacheReadTokens + split.cacheCreationTokens).toBe(prompt);
    }
  });

  it("ignores negative and fractional counts", () => {
    expect(splitCachedPrompt(-5, 100)).toEqual({
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(splitCachedPrompt(100.4, -3)).toEqual({
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 100,
    });
  });
});
