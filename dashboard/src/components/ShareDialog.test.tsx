import { describe, expect, it } from "vitest";
import {
  type ModelTotals,
  rankShareModels,
  SHARE_ADDITIONAL_MODEL_COUNT,
  SHARE_TOP_MODEL_COUNT,
  type ShareModel,
  visibleShareModels,
  weightedModelScore,
} from "./ShareDialog";

function model(overrides: Partial<ShareModel>): ShareModel {
  return { model: "model", provider: "codex", cost: 0, tokens: 0, ...overrides };
}

describe("share model ranking", () => {
  it("weights token share at 60% and cost share at 40%", () => {
    const totals: ModelTotals = { tokens: 1_000, cost: 100 };
    const tokenHeavy = model({ tokens: 800, cost: 10 });
    const costHeavy = model({ model: "cost-heavy", tokens: 200, cost: 90 });

    expect(weightedModelScore(tokenHeavy, totals)).toBeCloseTo(0.52);
    expect(weightedModelScore(costHeavy, totals)).toBeCloseTo(0.48);
    expect(rankShareModels([costHeavy, tokenHeavy])).toEqual([tokenHeavy, costHeavy]);
  });

  it("keeps four detailed models and caps the pill tail at five", () => {
    const models = Array.from({ length: 12 }, (_, index) =>
      model({ model: `model-${index}`, tokens: 12 - index, cost: 12 - index }),
    );

    expect(visibleShareModels(models)).toHaveLength(SHARE_TOP_MODEL_COUNT + SHARE_ADDITIONAL_MODEL_COUNT);
    expect(visibleShareModels(models).slice(0, SHARE_TOP_MODEL_COUNT)).toHaveLength(SHARE_TOP_MODEL_COUNT);
    expect(visibleShareModels(models).slice(SHARE_TOP_MODEL_COUNT)).toHaveLength(
      SHARE_ADDITIONAL_MODEL_COUNT,
    );
  });
});
