import { describe, expect, it } from "vitest";
import { MAX_IDLE_MULTIPLIER, nextIdleMultiplier } from "./refresh-cadence.js";

describe("nextIdleMultiplier", () => {
  it("widens a step at a time while nothing is written", () => {
    expect(nextIdleMultiplier(1, false)).toBe(2);
    expect(nextIdleMultiplier(2, false)).toBe(4);
  });

  it("stops widening at the cap", () => {
    expect(nextIdleMultiplier(MAX_IDLE_MULTIPLIER, false)).toBe(MAX_IDLE_MULTIPLIER);
    expect(nextIdleMultiplier(1_000, false)).toBe(MAX_IDLE_MULTIPLIER);
  });

  // An agent starting after an idle afternoon must not wait out the widened
  // interval before its first refresh.
  it("returns to the configured interval the moment something is written", () => {
    expect(nextIdleMultiplier(MAX_IDLE_MULTIPLIER, true)).toBe(1);
    expect(nextIdleMultiplier(1, true)).toBe(1);
  });

  it("treats a nonsense multiplier as the base interval", () => {
    expect(nextIdleMultiplier(0, false)).toBe(2);
    expect(nextIdleMultiplier(Number.NaN, false)).toBe(2);
  });
});
