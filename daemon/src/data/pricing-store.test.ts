import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { estimateCost } from "../domain/pricing.js";
import { PRICING_REFRESH_MS, type PricingResponse, PricingStore } from "./pricing-store.js";

const million = {
  inputTokens: 1_000_000,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

let directory = "";

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function response(value: unknown): PricingResponse {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  };
}

describe("PricingStore", () => {
  it("uses the downloaded model rates and keeps provider fallbacks", async () => {
    directory = await mkdtemp(join(tmpdir(), "obol-pricing-"));
    let calls = 0;
    const store = new PricingStore(join(directory, "pricing.json"), {
      fetcher: async () => {
        calls += 1;
        return response({
          lastUpdated: "2026-08-25",
          models: [
            {
              id: "openai-gpt-5-mini",
              name: "GPT-5 mini",
              family: "GPT-5",
              pricing: { inputPerM: 0.9, cachedInputPerM: 0.09, outputPerM: 4 },
            },
          ],
        });
      },
    });

    const table = await store.load();
    expect(calls).toBe(1);
    expect(estimateCost("openai/gpt-5-mini", million, table)).toBe(0.9);
    expect(estimateCost("composer-2.5", million, table)).toBe(0.5);
  });

  it("fetches at most once per day and serves the cached table offline", async () => {
    directory = await mkdtemp(join(tmpdir(), "obol-pricing-"));
    let nowMs = Date.parse("2026-08-25T10:00:00Z");
    let calls = 0;
    const payload = {
      models: [
        {
          id: "anthropic-claude-sonnet-4.5",
          name: "Claude Sonnet 4.5",
          family: "Claude 4.5",
          pricing: { inputPerM: 3, cachedInputPerM: 0.3, outputPerM: 15 },
        },
      ],
    };
    const first = new PricingStore(join(directory, "pricing.json"), {
      now: () => new Date(nowMs),
      fetcher: async () => {
        calls += 1;
        return response(payload);
      },
    });

    await first.load();
    await first.load();
    expect(calls).toBe(1);

    const second = new PricingStore(join(directory, "pricing.json"), {
      now: () => new Date(nowMs),
      fetcher: async () => {
        calls += 1;
        throw new Error("offline");
      },
    });
    const cached = await second.load();
    expect(calls).toBe(1);
    expect(estimateCost("claude-sonnet-4.5", million, cached)).toBe(3);

    nowMs += PRICING_REFRESH_MS;
    await second.load();
    await second.load();
    expect(calls).toBe(2);
  });
});
