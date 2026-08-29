import { describe, expect, it } from "vitest";
import { formatCurrency, formatTokens } from "./format";
import {
  type ModelTotals,
  rankShareModels,
  SHARE_ADDITIONAL_MODEL_COUNT,
  SHARE_COLUMN_GAP,
  SHARE_CONTENT_PAD,
  SHARE_MIN_WIDTH,
  SHARE_MODEL_ICON_STEP,
  SHARE_MODEL_METRIC_GAP,
  SHARE_TOP_MODEL_COUNT,
  type ShareData,
  type ShareModel,
  shareImageWidth,
  visibleShareModels,
  weightedModelScore,
} from "./ShareDialog";

function model(overrides: Partial<ShareModel>): ShareModel {
  return { model: "model", provider: "codex", cost: 0, tokens: 0, ...overrides };
}

/** Monospace-ish stand-in: canvas text metrics are unavailable under vitest. */
function measuringContext() {
  let size = 12;
  return {
    set font(value: string) {
      size = Number(value.match(/(\d+)px/)?.[1] ?? 12);
    },
    get font() {
      return `${size}px`;
    },
    measureText(value: string) {
      return { width: value.length * size * 0.6 };
    },
  } as unknown as CanvasRenderingContext2D;
}

function shareData(overrides: Partial<ShareData> = {}): ShareData {
  return {
    rangeLabel: "Today",
    dateLabel: "Aug 29",
    cost: 9_199.73,
    tokens: 344_600_000,
    models: [],
    modelCount: 3,
    trackedSince: "Jan 1",
    dailyRows: [],
    ...overrides,
  };
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

describe("share image sizing", () => {
  const context = measuringContext();

  it("keeps the default width when the content is narrow", () => {
    const top = [model({ model: "gpt-5-codex", cost: 12, tokens: 1_000 })];
    expect(shareImageWidth(context, shareData(), top, [], 2).width).toBe(SHARE_MIN_WIDTH);
  });

  it("grows so the model column never overruns the frame", () => {
    const top = [
      model({
        model: "anthropic/claude-opus-4-1-20250805-extended-thinking",
        cost: 987_654.32,
        tokens: 987_654_321_000,
      }),
    ];
    const data = shareData({ cost: 9_876_543.21, tokens: 987_654_321_000 });
    const { width, leftWidth, rightWidth } = shareImageWidth(context, data, top, [], 2);

    expect(width).toBeGreaterThan(SHARE_MIN_WIDTH);
    const detailX = Math.max(
      SHARE_CONTENT_PAD + leftWidth + SHARE_COLUMN_GAP,
      width - SHARE_CONTENT_PAD - rightWidth,
    );
    const nameX = detailX + SHARE_MODEL_ICON_STEP;
    context.font = "500 12px monospace";
    const metricWidth = context.measureText(
      `${formatCurrency(top[0].cost)} · ${formatTokens(top[0].tokens)}`,
    ).width;
    context.font = "600 15px monospace";
    const nameWidth = context.measureText(top[0].model).width;
    expect(nameX + nameWidth + SHARE_MODEL_METRIC_GAP + metricWidth).toBeLessThanOrEqual(
      width - SHARE_CONTENT_PAD,
    );
  });

  it("puts spare width in the gutter between the two sections", () => {
    const top = [model({ model: "gpt-5-codex", cost: 12, tokens: 1_000 })];
    const { width, leftWidth, rightWidth } = shareImageWidth(context, shareData(), top, [], 2);
    const detailX = Math.max(
      SHARE_CONTENT_PAD + leftWidth + SHARE_COLUMN_GAP,
      width - SHARE_CONTENT_PAD - rightWidth,
    );

    // The list ends flush with the right content edge, and every spare pixel
    // sits between the summary column and the list.
    expect(detailX + rightWidth).toBe(width - SHARE_CONTENT_PAD);
    expect(detailX - (SHARE_CONTENT_PAD + leftWidth)).toBeGreaterThanOrEqual(SHARE_COLUMN_GAP);
  });

  it("sizes the other-models columns from the widest entry", () => {
    const extras = [
      model({ model: "a-very-long-secondary-model-identifier", cost: 12.5, tokens: 5_000_000 }),
      model({ model: "short", cost: 1, tokens: 10 }),
    ];
    const { width, moreColumnWidth } = shareImageWidth(context, shareData(), [], extras, 2);

    context.font = "600 11px monospace";
    expect(moreColumnWidth).toBeGreaterThan(context.measureText(extras[0].model).width);
    expect(SHARE_CONTENT_PAD * 2 + moreColumnWidth * 2 + 18).toBeLessThanOrEqual(width);
  });
});
