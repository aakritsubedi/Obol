import { formatCurrency, formatTokens } from "@shared/lib/format";
import { providerName } from "@shared/providers/catalog";
import { type ShareData, type ShareModel, usageComments } from "../model/shareData";
import { shareFonts, textWidth } from "./fonts";

export interface ContributionGraphLayout {
  gap: number;
  labelWidth: number;
  cellSize: number;
  topOffset: number;
  plotHeight: number;
  height: number;
}

export const SHARE_FRAME_INSET = 24;
export const SHARE_CONTENT_PAD = 62;
export const SHARE_COLUMN_GAP = 64;
export const SHARE_MIN_WIDTH = 1200;
export const SHARE_MODEL_ICON_STEP = 32;
export const SHARE_MODEL_METRIC_GAP = 28;
export const SHARE_USAGE_GAP = 20;
export const SHARE_USAGE_LABEL_Y = 278;
export const SHARE_USAGE_VALUE_Y = 302;

export function contributionGraphLayout(
  calendar: { weeks: unknown[] },
  width: number,
  maxCellSize = 18,
): ContributionGraphLayout {
  const gap = 4;
  const labelWidth = 30;
  const plotWidth = width - labelWidth - 8;
  const weekCount = Math.max(1, calendar.weeks.length);
  const cellSize = Math.max(8, Math.min(maxCellSize, (plotWidth - gap * (weekCount - 1)) / weekCount));
  const plotHeight = cellSize * 7 + gap * 6;
  const topOffset = 84;
  return { gap, labelWidth, cellSize, topOffset, plotHeight, height: topOffset + plotHeight };
}

export function shareImageWidth(
  context: CanvasRenderingContext2D,
  data: ShareData,
  topModels: ShareModel[],
  additionalModels: ShareModel[],
  moreColumns: number,
) {
  const usage = usageComments(data);
  const usageWidth =
    usage.reduce(
      (sum, part) => sum + textWidth(context, shareFonts.usage, `// ${part.value} ${part.label}`),
      0,
    ) +
    SHARE_USAGE_GAP * (usage.length - 1);
  const leftWidth = Math.max(
    textWidth(context, shareFonts.date, `// ${data.dateLabel.toLowerCase()}`),
    textWidth(context, shareFonts.cost, formatCurrency(data.cost)),
    textWidth(context, shareFonts.costLabel, "total_spend"),
    textWidth(context, shareFonts.usage, "// total usage"),
    usageWidth,
  );

  const modelRowWidths = topModels.map((model) => {
    const name = textWidth(context, shareFonts.modelName, model.model);
    const provider = textWidth(context, shareFonts.modelProvider, providerName(model.provider).toLowerCase());
    const metric = textWidth(
      context,
      shareFonts.modelMetric,
      `${formatCurrency(model.cost)} · ${formatTokens(model.tokens)}`,
    );
    return SHARE_MODEL_ICON_STEP + Math.max(name + SHARE_MODEL_METRIC_GAP + metric, provider);
  });
  const rightWidth = Math.max(
    260,
    textWidth(context, shareFonts.section, "// top models"),
    ...modelRowWidths,
  );
  const moreCellWidths = additionalModels.map((model) =>
    Math.max(
      textWidth(context, shareFonts.moreName, model.model),
      textWidth(
        context,
        shareFonts.moreMetric,
        `${formatCurrency(model.cost)} · ${formatTokens(model.tokens)} tokens`,
      ),
    ),
  );
  const moreColumnWidth = moreCellWidths.length ? Math.max(...moreCellWidths) + 30 : 0;
  const moreWidth = moreColumnWidth ? moreColumnWidth * moreColumns + 18 * (moreColumns - 1) : 0;
  const chromeWidth =
    145 +
    textWidth(context, shareFonts.chrome, `usage/${data.rangeLabel.toLowerCase().replace(/ /g, "-")}.md`) +
    36 +
    40 +
    textWidth(context, shareFonts.chromeMuted, "OBOL / USAGE") +
    SHARE_CONTENT_PAD;
  const footerNote =
    data.rangeLabel === "Total" ? `tracked_since: ${data.trackedSince}` : "local · UTF-8 · usage snapshot";
  const footerWidth =
    53 +
    27 +
    textWidth(context, shareFonts.footerBrand, "obol") +
    48 +
    textWidth(context, shareFonts.footerNote, footerNote) +
    SHARE_CONTENT_PAD;
  const width = Math.ceil(
    Math.max(
      SHARE_MIN_WIDTH,
      SHARE_CONTENT_PAD * 2 + leftWidth + SHARE_COLUMN_GAP + rightWidth,
      SHARE_CONTENT_PAD * 2 + moreWidth,
      chromeWidth,
      footerWidth,
    ),
  );
  return { width, leftWidth, rightWidth, moreColumnWidth, footerNote };
}
