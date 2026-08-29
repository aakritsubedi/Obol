import { useMemo, useState } from "react";
import type { ModelBreakdown, Report, Summary, UsageRow } from "../api";
import { ProviderLogo, providerColor, providerConfig, providerName } from "../providers";
import { buildContributionCalendar, type ContributionCalendar, trimFutureContribution } from "./contribution";
import { formatCurrency, formatPeriod, formatTokens, heroFontSize, numberValue } from "./format";
import { modelName } from "./totals";

type ShareRange = "today" | "week" | "month" | "total";

interface Props {
  report: Report | null;
  summary: Summary;
  onClose: () => void;
}

export interface ShareModel {
  model: string;
  provider: string;
  cost: number;
  tokens: number;
}

export const SHARE_TOP_MODEL_COUNT = 4;
export const SHARE_ADDITIONAL_MODEL_COUNT = 5;
export const SHARE_TOKEN_WEIGHT = 0.6;
export const SHARE_COST_WEIGHT = 0.4;

export interface ShareData {
  rangeLabel: string;
  dateLabel: string;
  cost: number;
  tokens: number;
  models: ShareModel[];
  modelCount: number;
  trackedSince: string;
  dailyRows: UsageRow[];
}

export interface ModelTotals {
  cost: number;
  tokens: number;
}

const ranges: Array<{ value: ShareRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "total", label: "Total" },
];

function rangeRows(report: Report | null, summary: Summary, range: ShareRange) {
  const rows = report?.daily || [];
  const today = summary.today.period.slice(0, 10);
  if (range === "total") return rows;
  if (!today) return [];
  if (range === "today") return rows.filter((row) => row.period.slice(0, 10) === today);
  if (range === "month") return rows.filter((row) => row.period.slice(0, 7) === today.slice(0, 7));
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - 6);
  const start = date.toISOString().slice(0, 10);
  return rows.filter((row) => row.period.slice(0, 10) >= start && row.period.slice(0, 10) <= today);
}

function breakdownForRow(row: {
  modelBreakdowns?: ModelBreakdown[];
  agents?: Array<{ agent?: string; modelBreakdowns?: ModelBreakdown[] }>;
}) {
  const nested = (row.agents || []).flatMap((agent) =>
    (agent.modelBreakdowns || []).map((model) => ({ model, provider: String(agent.agent || "Unknown") })),
  );
  if (nested.length) return nested;
  return (row.modelBreakdowns || []).map((model) => ({ model, provider: String(model.agent || "Unknown") }));
}

function modelTokens(model: ModelBreakdown): number {
  const explicit = Number(model.totalTokens);
  if (Number.isFinite(explicit)) return explicit;
  return ["inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens"].reduce(
    (sum, key) => sum + numberValue(model[key]),
    0,
  );
}

function modelTotals(models: ShareModel[]): ModelTotals {
  return models.reduce(
    (totals, model) => ({
      cost: totals.cost + Math.max(0, model.cost),
      tokens: totals.tokens + Math.max(0, model.tokens),
    }),
    { cost: 0, tokens: 0 },
  );
}

/**
 * Rank models using comparable metric shares instead of adding raw dollars to
 * raw token counts. Each model contributes a share of the visible model
 * totals, then tokens and cost are combined with the requested 60/40 weights.
 */
export function weightedModelScore(model: ShareModel, totals: ModelTotals): number {
  const tokenShare = totals.tokens > 0 ? Math.max(0, model.tokens) / totals.tokens : 0;
  const costShare = totals.cost > 0 ? Math.max(0, model.cost) / totals.cost : 0;
  return tokenShare * SHARE_TOKEN_WEIGHT + costShare * SHARE_COST_WEIGHT;
}

export function rankShareModels(models: ShareModel[]): ShareModel[] {
  const totals = modelTotals(models);
  return [...models].sort((left, right) => {
    const scoreDifference = weightedModelScore(right, totals) - weightedModelScore(left, totals);
    if (scoreDifference !== 0) return scoreDifference;
    return (
      right.tokens - left.tokens ||
      right.cost - left.cost ||
      left.provider.localeCompare(right.provider) ||
      left.model.localeCompare(right.model)
    );
  });
}

export function visibleShareModels(models: ShareModel[]): ShareModel[] {
  return rankShareModels(models).slice(0, SHARE_TOP_MODEL_COUNT + SHARE_ADDITIONAL_MODEL_COUNT);
}

function buildShareData(report: Report | null, summary: Summary, range: ShareRange): ShareData {
  const rows = rangeRows(report, summary, range);
  const fallback = range === "today" ? summary.today : null;
  const cost = rows.length
    ? rows.reduce((sum, row) => sum + numberValue(row.totalCost), 0)
    : fallback?.totalCost || 0;
  const tokens = rows.length
    ? rows.reduce((sum, row) => sum + numberValue(row.totalTokens), 0)
    : fallback?.totalTokens || 0;
  const models = new Map<string, ShareModel>();
  for (const row of rows) {
    for (const entry of breakdownForRow(row)) {
      const key = `${entry.provider}\u0000${modelName(entry.model)}`;
      const current = models.get(key) || {
        model: modelName(entry.model),
        provider: entry.provider,
        cost: 0,
        tokens: 0,
      };
      current.cost += numberValue(entry.model.totalCost ?? entry.model.cost);
      current.tokens += modelTokens(entry.model);
      models.set(key, current);
    }
  }
  if (!models.size && fallback) {
    for (const entry of fallback.modelBreakdowns || []) {
      const key = `fallback\u0000${modelName(entry)}`;
      models.set(key, {
        model: modelName(entry),
        provider: String(entry.agent || "Unknown"),
        cost: numberValue(entry.totalCost ?? entry.cost),
        tokens: modelTokens(entry),
      });
    }
  }
  const first = report?.daily[0]?.period || summary.today.period;
  const dateLabel =
    range === "total"
      ? "All tracked usage"
      : range === "month"
        ? "Current month"
        : range === "week"
          ? "Trailing 7 days"
          : formatPeriod(summary.today.period);
  return {
    rangeLabel: ranges.find((item) => item.value === range)?.label || "Usage",
    dateLabel,
    cost,
    tokens,
    models: visibleShareModels([...models.values()]),
    modelCount: models.size,
    trackedSince: first ? formatPeriod(first) : "usage began",
    dailyRows: report?.daily || [],
  };
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawRoundedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  if (!image) return false;
  context.save();
  roundedRect(context, x, y, size, size, radius);
  context.clip();
  context.drawImage(image, x, y, size, size);
  context.restore();
  return true;
}

function fitCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) return value;
  const suffix = "…";
  let result = value;
  while (result.length > 1 && context.measureText(`${result}${suffix}`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result.trimEnd()}${suffix}`;
}

function drawModelComment(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  model: ShareModel,
  x: number,
  y: number,
  width: number,
) {
  const color = providerColor(model.provider);
  const iconSize = 20;
  const textX = x + iconSize + 10;
  if (!drawRoundedImage(context, image, x, y - 14, iconSize, 5)) {
    context.fillStyle = color;
    roundedRect(context, x, y - 14, iconSize, iconSize, 5);
    context.fill();
  }
  context.fillStyle = "#e7e9ed";
  context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(fitCanvasText(context, model.model, Math.max(40, width - (textX - x))), textX, y);
  const metrics = `${formatCurrency(model.cost)} · ${formatTokens(model.tokens)} tokens`;
  context.fillStyle = "#aeb4bf";
  context.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(metrics, textX, y + 15);
}

const exportContributionColors: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "#24272d",
  1: "#033a16",
  2: "#196c2e",
  3: "#2ea043",
  4: "#56d364",
};

interface ContributionGraphLayout {
  gap: number;
  labelWidth: number;
  cellSize: number;
  topOffset: number;
  plotHeight: number;
  height: number;
}

function contributionGraphLayout(
  calendar: ContributionCalendar,
  width: number,
  maxCellSize = 18,
): ContributionGraphLayout {
  const gap = 4;
  const labelWidth = 30;
  const plotWidth = width - labelWidth - 8;
  const weekCount = Math.max(1, calendar.weeks.length);
  const cellSize = Math.max(8, Math.min(maxCellSize, (plotWidth - gap * (weekCount - 1)) / weekCount));
  const plotHeight = cellSize * 7 + gap * 6;
  // Leave a full line between the subtitle and month labels; the old offset
  // placed labels only a few pixels below the subtitle in activity exports.
  const topOffset = 84;
  return { gap, labelWidth, cellSize, topOffset, plotHeight, height: topOffset + plotHeight };
}

function drawContributionGraph(
  context: CanvasRenderingContext2D,
  calendar: ContributionCalendar,
  x: number,
  y: number,
  width: number,
  maxCellSize = 18,
): number {
  const layout = contributionGraphLayout(calendar, width, maxCellSize);
  const plotX = x + layout.labelWidth + 8;
  const gridY = y + layout.topOffset;
  const totals = calendar.days.reduce(
    (result, day) => {
      if (day.state !== "future") {
        result.tokens += day.tokens;
        result.cost += day.cost;
      }
      return result;
    },
    { tokens: 0, cost: 0 },
  );

  context.fillStyle = "#858b98";
  context.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText("// activity", x, y);
  context.fillStyle = "#e7e9ed";
  context.font = "650 15px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(`${calendar.year} token burn`, x, y + 20);
  context.fillStyle = "#737987";
  context.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(
    `daily usage · ${formatTokens(totals.tokens)} tokens · ${formatCurrency(totals.cost)} this year`,
    x,
    y + 37,
  );

  const legendX = x + width - 168;
  context.fillStyle = "#737987";
  context.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText("Less", legendX, y + 7);
  [0, 1, 2, 3, 4].forEach((level, index) => {
    const swatchX = legendX + 31 + index * 16;
    context.fillStyle = exportContributionColors[level as 0 | 1 | 2 | 3 | 4];
    roundedRect(context, swatchX, y - 3, 11, 11, 3);
    context.fill();
  });
  context.fillStyle = "#737987";
  context.fillText("More", legendX + 116, y + 7);

  context.fillStyle = "#737987";
  context.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (const month of calendar.monthLabels) {
    const monthX = plotX + month.weekIndex * (layout.cellSize + layout.gap);
    context.fillText(month.label, monthX, gridY - 15);
  }
  for (const [index, label] of ["", "Mon", "", "Wed", "", "Fri", ""].entries()) {
    if (!label) continue;
    context.fillText(
      label,
      x + 22 - context.measureText(label).width,
      gridY + index * (layout.cellSize + layout.gap) + 8,
    );
  }

  for (const [weekIndex, week] of calendar.weeks.entries()) {
    const weekX = plotX + weekIndex * (layout.cellSize + layout.gap);
    for (const [dayIndex, day] of week.days.entries()) {
      if (!day) continue;
      context.globalAlpha = day.state === "before-data" ? 0.35 : 1;
      context.fillStyle = exportContributionColors[day.level];
      roundedRect(
        context,
        weekX,
        gridY + dayIndex * (layout.cellSize + layout.gap),
        layout.cellSize,
        layout.cellSize,
        Math.min(4, layout.cellSize / 3),
      );
      context.fill();
    }
  }
  context.globalAlpha = 1;
  return layout.height;
}

const shareFonts = {
  chrome: "600 14px ui-monospace, SFMono-Regular, Menlo, monospace",
  chromeMuted: "500 12px ui-monospace, SFMono-Regular, Menlo, monospace",
  date: "500 14px ui-monospace, SFMono-Regular, Menlo, monospace",
  cost: "700 62px -apple-system, BlinkMacSystemFont, sans-serif",
  costLabel: "500 13px ui-monospace, SFMono-Regular, Menlo, monospace",
  usage: "500 13px ui-monospace, SFMono-Regular, Menlo, monospace",
  section: "600 12px ui-monospace, SFMono-Regular, Menlo, monospace",
  sectionSmall: "600 11px ui-monospace, SFMono-Regular, Menlo, monospace",
  modelName: "600 15px ui-monospace, SFMono-Regular, Menlo, monospace",
  modelProvider: "500 11px ui-monospace, SFMono-Regular, Menlo, monospace",
  modelMetric: "500 12px ui-monospace, SFMono-Regular, Menlo, monospace",
  moreName: "600 11px ui-monospace, SFMono-Regular, Menlo, monospace",
  moreMetric: "500 10px ui-monospace, SFMono-Regular, Menlo, monospace",
  footerBrand: "650 14px ui-monospace, SFMono-Regular, Menlo, monospace",
  footerNote: "500 12px ui-monospace, SFMono-Regular, Menlo, monospace",
};

function textWidth(context: CanvasRenderingContext2D, font: string, value: string): number {
  context.font = font;
  return context.measureText(value).width;
}

const SHARE_FRAME_INSET = 24;
export const SHARE_CONTENT_PAD = 62;
export const SHARE_COLUMN_GAP = 64;
export const SHARE_MIN_WIDTH = 1200;
export const SHARE_MODEL_ICON_STEP = 32;
export const SHARE_MODEL_METRIC_GAP = 28;
const SHARE_USAGE_GAP = 20;
const SHARE_USAGE_LABEL_Y = 278;
const SHARE_USAGE_VALUE_Y = 302;

/** The `// 367.5M tokens 🔥` comments under the hero amount, shared by card and export. */
function usageComments(data: ShareData) {
  return [
    { value: formatTokens(data.tokens), label: "tokens 🔥" },
    { value: String(data.modelCount), label: "models 🤖" },
  ];
}

/**
 * Measure every block before sizing the canvas so long values — NPR amounts,
 * verbose model ids — widen the card instead of spilling past its frame.
 */
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

async function exportShareImage(data: ShareData) {
  const topModels = data.models.slice(0, SHARE_TOP_MODEL_COUNT);
  const additionalModels = data.models.slice(
    SHARE_TOP_MODEL_COUNT,
    SHARE_TOP_MODEL_COUNT + SHARE_ADDITIONAL_MODEL_COUNT,
  );
  const providerImages = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    [...new Set([...topModels, ...additionalModels].map((model) => model.provider))].map(async (provider) => {
      const id = providerConfig(provider).id;
      providerImages.set(provider, id ? await loadImage(`/providers/${id}.png`) : null);
    }),
  );
  const obolIcon = await loadImage("/favicon-32.png");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  const detailRowStep = 56;
  const moreColumns = 2;
  const moreRowStep = 42;
  const detailStartY = 177;
  const {
    width: canvasWidth,
    leftWidth,
    rightWidth,
    moreColumnWidth,
    footerNote,
  } = shareImageWidth(context, data, topModels, additionalModels, moreColumns);
  // Anchor the model list to the right edge so spare width lands in the gutter
  // between the two sections rather than as a void inside every row.
  const detailX = Math.max(
    SHARE_CONTENT_PAD + leftWidth + SHARE_COLUMN_GAP,
    canvasWidth - SHARE_CONTENT_PAD - rightWidth,
  );
  const metricsRight = canvasWidth - SHARE_CONTENT_PAD;
  const frameRight = canvasWidth - SHARE_FRAME_INSET;
  // Track where each column actually ends — the summary at its usage comments,
  // the list at its last provider line — so a short card is not padded out with
  // dead space before the footer.
  const summaryBottom = SHARE_USAGE_VALUE_Y + 8;
  const modelsBottom = topModels.length ? detailStartY + (topModels.length - 1) * detailRowStep + 20 : 135;
  const firstRowBottom = Math.max(summaryBottom, modelsBottom);
  const moreHeaderY = firstRowBottom + 28;
  const moreStartY = moreHeaderY + 25;
  const moreRows = Math.ceil(additionalModels.length / moreColumns);
  const modelContentBottom = additionalModels.length ? moreStartY + moreRows * moreRowStep : firstRowBottom;
  const canvasHeight = Math.max(420, Math.ceil(modelContentBottom + 110));
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const footerY = canvasHeight - 74;
  const outerHeight = canvasHeight - SHARE_FRAME_INSET * 2;

  context.fillStyle = "#111216";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  roundedRect(
    context,
    SHARE_FRAME_INSET,
    SHARE_FRAME_INSET,
    canvasWidth - SHARE_FRAME_INSET * 2,
    outerHeight,
    18,
  );
  context.clip();
  context.strokeStyle = "#343840";
  context.lineWidth = 2;
  context.fillStyle = "#1d1f25";
  context.fillRect(25, 25, canvasWidth - 50, 64);
  [
    ["#f06b60", 55],
    ["#f1bd4a", 79],
    ["#59bf55", 103],
  ].forEach(([color, x]) => {
    context.fillStyle = String(color);
    context.beginPath();
    context.arc(Number(x), 57, 7, 0, Math.PI * 2);
    context.fill();
  });
  const fileLabel = `usage/${data.rangeLabel.toLowerCase().replace(/ /g, "-")}.md`;
  const pillWidth = Math.max(260, textWidth(context, shareFonts.chrome, fileLabel) + 36);
  context.fillStyle = "#2a2d35";
  roundedRect(context, 145, 42, pillWidth, 30, 7);
  context.fill();
  context.fillStyle = "#cdd1da";
  context.font = shareFonts.chrome;
  context.fillText(fileLabel, 163, 62);
  context.fillStyle = "#737987";
  context.font = shareFonts.chromeMuted;
  context.textAlign = "right";
  context.fillText("OBOL / USAGE", metricsRight, 62);
  context.textAlign = "left";
  context.fillStyle = "#9399a7";
  context.font = shareFonts.date;
  context.fillText(`// ${data.dateLabel.toLowerCase()}`, SHARE_CONTENT_PAD, 135);
  context.fillStyle = "#f5f6f8";
  context.font = shareFonts.cost;
  context.fillText(formatCurrency(data.cost), SHARE_CONTENT_PAD, 212);
  context.fillStyle = "#858b98";
  context.font = shareFonts.costLabel;
  context.fillText("total_spend", SHARE_CONTENT_PAD + 4, 237);
  context.fillStyle = "#858b98";
  context.font = shareFonts.usage;
  context.fillText("// total usage", SHARE_CONTENT_PAD, SHARE_USAGE_LABEL_Y);
  let usageX = SHARE_CONTENT_PAD;
  for (const part of usageComments(data)) {
    context.font = shareFonts.usage;
    context.fillStyle = "#858b98";
    context.fillText("// ", usageX, SHARE_USAGE_VALUE_Y);
    usageX += textWidth(context, shareFonts.usage, "// ");
    context.fillStyle = "#86efac";
    context.fillText(part.value, usageX, SHARE_USAGE_VALUE_Y);
    usageX += textWidth(context, shareFonts.usage, part.value);
    context.fillStyle = "#858b98";
    context.fillText(` ${part.label}`, usageX, SHARE_USAGE_VALUE_Y);
    usageX += textWidth(context, shareFonts.usage, ` ${part.label}`) + SHARE_USAGE_GAP;
  }
  context.fillStyle = "#858b98";
  context.font = shareFonts.section;
  context.fillText("// top models", detailX, 135);
  for (const [index, model] of topModels.entries()) {
    const y = detailStartY + index * detailRowStep;
    const color = providerColor(model.provider);
    if (!drawRoundedImage(context, providerImages.get(model.provider) || null, detailX, y - 15, 22, 6)) {
      context.fillStyle = color;
      roundedRect(context, detailX, y - 15, 22, 22, 6);
      context.fill();
    }
    const metric = `${formatCurrency(model.cost)} · ${formatTokens(model.tokens)}`;
    const metricWidth = textWidth(context, shareFonts.modelMetric, metric);
    const nameX = detailX + SHARE_MODEL_ICON_STEP;
    context.fillStyle = "#e7e9ed";
    context.font = shareFonts.modelName;
    context.fillText(
      fitCanvasText(context, model.model, metricsRight - metricWidth - SHARE_MODEL_METRIC_GAP - nameX),
      nameX,
      y,
    );
    context.fillStyle = "#737987";
    context.font = shareFonts.modelProvider;
    context.fillText(providerName(model.provider).toLowerCase(), nameX, y + 14);
    context.fillStyle = "#aeb4bf";
    context.font = shareFonts.modelMetric;
    context.textAlign = "right";
    context.fillText(metric, metricsRight, y + 5);
    context.textAlign = "left";
  }
  if (additionalModels.length) {
    context.strokeStyle = "#343840";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(25, firstRowBottom + 8);
    context.lineTo(frameRight, firstRowBottom + 8);
    context.stroke();
    context.fillStyle = "#858b98";
    context.font = shareFonts.sectionSmall;
    context.fillText("// other models used", SHARE_CONTENT_PAD, moreHeaderY);
    additionalModels.forEach((model, index) => {
      const column = index % moreColumns;
      const row = Math.floor(index / moreColumns);
      drawModelComment(
        context,
        providerImages.get(model.provider) || null,
        model,
        SHARE_CONTENT_PAD + column * (moreColumnWidth + 18),
        moreStartY + row * moreRowStep,
        moreColumnWidth,
      );
    });
  }
  context.strokeStyle = "#343840";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(25, footerY);
  context.lineTo(frameRight, footerY);
  context.stroke();
  if (!drawRoundedImage(context, obolIcon, 53, canvasHeight - 53, 18, 5)) {
    context.fillStyle = "#9d8cf2";
    roundedRect(context, 53, canvasHeight - 53, 18, 18, 5);
    context.fill();
  }
  context.fillStyle = "#111216";
  context.font = "700 11px -apple-system, BlinkMacSystemFont, sans-serif";
  if (!obolIcon) context.fillText("o", 59, canvasHeight - 40);
  context.fillStyle = "#e7e9ed";
  context.font = shareFonts.footerBrand;
  context.fillText("obol", 80, canvasHeight - 43);
  context.fillStyle = "#858b98";
  context.font = shareFonts.footerNote;
  context.textAlign = "right";
  context.fillText(footerNote, metricsRight, canvasHeight - 43);
  context.textAlign = "left";
  context.restore();
  canvas.toBlob(
    (blob) => blob && downloadBlob(`obol-${data.rangeLabel.toLowerCase().replace(/ /g, "-")}.png`, blob),
    "image/png",
  );
}

async function exportContributionImage(rows: UsageRow[]) {
  const calendar = trimFutureContribution(buildContributionCalendar(rows, new Date()));
  const canvasWidth = 1600;
  const contentX = 64;
  const contentWidth = canvasWidth - contentX * 2;
  const graphTop = 132;
  const layout = contributionGraphLayout(calendar, contentWidth, 40);
  const footerGap = 28;
  const footerHeight = 70;
  const canvasHeight = Math.max(420, graphTop + layout.height + footerGap + footerHeight);
  const footerY = canvasHeight - footerHeight;
  const outerHeight = canvasHeight - 48;
  const obolIcon = await loadImage("/favicon-32.png");
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#111216";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  roundedRect(context, 24, 24, canvasWidth - 48, outerHeight, 18);
  context.clip();
  context.fillStyle = "#1d1f25";
  context.fillRect(25, 25, canvasWidth - 50, 64);
  [
    ["#f06b60", 55],
    ["#f1bd4a", 79],
    ["#59bf55", 103],
  ].forEach(([color, x]) => {
    context.fillStyle = String(color);
    context.beginPath();
    context.arc(Number(x), 57, 7, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = "#2a2d35";
  roundedRect(context, 145, 42, 320, 30, 7);
  context.fill();
  context.fillStyle = "#cdd1da";
  context.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(`usage/activity-${calendar.year}.md`, 163, 62);
  context.fillStyle = "#737987";
  context.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "right";
  context.fillText("OBOL / ACTIVITY", canvasWidth - contentX, 62);
  context.textAlign = "left";
  drawContributionGraph(context, calendar, contentX, graphTop, contentWidth, 40);
  context.strokeStyle = "#343840";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(25, footerY);
  context.lineTo(canvasWidth - 25, footerY);
  context.stroke();
  if (!drawRoundedImage(context, obolIcon, 53, canvasHeight - 53, 18, 5)) {
    context.fillStyle = "#9d8cf2";
    roundedRect(context, 53, canvasHeight - 53, 18, 18, 5);
    context.fill();
  }
  context.fillStyle = "#111216";
  context.font = "700 11px -apple-system, BlinkMacSystemFont, sans-serif";
  if (!obolIcon) context.fillText("o", 59, canvasHeight - 40);
  context.fillStyle = "#e7e9ed";
  context.font = "650 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText("obol", 80, canvasHeight - 43);
  context.fillStyle = "#858b98";
  context.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "right";
  context.fillText("local · UTF-8 · usage snapshot", canvasWidth - contentX, canvasHeight - 43);
  context.textAlign = "left";
  context.restore();
  canvas.toBlob((blob) => blob && downloadBlob(`obol-contribution-${calendar.year}.png`, blob), "image/png");
}

function ModelRow({ model }: { model: ShareModel }) {
  const color = providerColor(model.provider);
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0">
        <ProviderLogo agent={model.provider} size={26} color={color} />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
          title={`${model.model} · ${formatCurrency(model.cost)} · ${formatTokens(model.tokens)}`}
        >
          <span className="min-w-0 flex-1 truncate font-semibold">
            {model.model.split("/")[1] ? model.model.split("/")[1] : model.model}
          </span>
          <span className="shrink-0 whitespace-nowrap tabular-nums text-[#aeb4bf]">
            {formatCurrency(model.cost)} · {formatTokens(model.tokens)}
          </span>
        </div>
        <p className="mt-0.5 text-[9px] text-[#737987]">{providerName(model.provider).toLowerCase()}</p>
      </div>
    </div>
  );
}

function ModelComment({ model }: { model: ShareModel }) {
  const color = providerColor(model.provider);
  return (
    <span
      className="inline-flex min-w-0 items-start gap-2 text-[10px]"
      title={`${model.model} · ${providerName(model.provider)} · ${formatCurrency(model.cost)} · ${formatTokens(model.tokens)} tokens`}
    >
      <span className="shrink-0">
        <ProviderLogo agent={model.provider} size={20} color={color} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#e7e9ed]">
          {model.model.split("/")[1] ? model.model.split("/")[1] : model.model}
        </span>
        <span className="mt-0.5 block truncate tabular-nums text-[#aeb4bf]">
          {formatCurrency(model.cost)} · {formatTokens(model.tokens)} tokens
        </span>
      </span>
    </span>
  );
}

export default function ShareDialog({ report, summary, onClose }: Props) {
  const [range, setRange] = useState<ShareRange>("today");
  const data = useMemo(() => buildShareData(report, summary, range), [range, report, summary]);
  const topModels = data.models.slice(0, SHARE_TOP_MODEL_COUNT);
  const additionalModels = data.models.slice(
    SHARE_TOP_MODEL_COUNT,
    SHARE_TOP_MODEL_COUNT + SHARE_ADDITIONAL_MODEL_COUNT,
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/35 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[980px] overflow-hidden rounded-[24px] border border-hairline bg-card text-ink shadow-[0_24px_80px_rgba(0,0,0,.24)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Share usage</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.03em]" id="share-dialog-title">
              Create a social card
            </h2>
          </div>
          <div className="flex item-center gap-3">
            <button
              className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-hairline px-4 text-xs font-semibold text-ink transition hover:bg-wash"
              type="button"
              onClick={() => void exportContributionImage(data.dailyRows)}
            >
              <span aria-hidden="true">↓</span> Download contribution graph
            </button>
            <button
              className="grid h-8 w-8 place-items-center rounded-full border border-hairline text-muted transition hover:bg-wash hover:text-ink"
              type="button"
              onClick={onClose}
              aria-label="Close share dialog"
            >
              ×
            </button>
          </div>
        </div>
        <div className="grid gap-10 p-6 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div className="overflow-hidden rounded-[14px] bg-[#111216] font-mono text-[#f5f6f8] shadow-[0_18px_40px_rgba(0,0,0,.18)]">
            <div className="flex h-11 items-center gap-2 bg-[#1d1f25] px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f06b60]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f1bd4a]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#59bf55]" />
              <span className="ml-3 rounded-md bg-[#2a2d35] px-3 py-1 text-[10px] font-semibold text-[#cdd1da]">
                usage/{data.rangeLabel.toLowerCase().replace(/ /g, "-")}.md
              </span>
              <span className="ml-auto text-[9px] text-[#737987]">OBOL / USAGE</span>
            </div>
            <div className="grid grid-cols-[.85fr_1.15fr] max-[640px]:grid-cols-1 [&>div]:min-w-0">
              <div className="p-5 [container-type:inline-size] sm:p-6">
                <div className="text-[12px] text-[#858b98]">// {data.dateLabel.toLowerCase()}</div>
                <div
                  className="mt-5 font-bold leading-[1.05] tracking-[-0.06em]"
                  style={{ fontSize: heroFontSize(formatCurrency(data.cost), 48) }}
                >
                  {formatCurrency(data.cost)}
                </div>
                <div className="mt-1 text-[13px] text-[#858b98]">total_spend</div>
                <div className="mt-7 flex flex-wrap gap-1">
                  <div className="block text-[11px] text-[#858b98]">// total usage</div>
                  <div className="flex flex-wrap gap-2">
                    {usageComments(data).map((part) => (
                      <div className="block text-[11px] text-[#858b98]" key={part.label}>
                        //&nbsp;
                        <span className="text-green-300">{part.value}</span>&nbsp;
                        {part.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-5 sm:p-6">
                <div className="mb-5 text-[10px] font-semibold text-[#858b98]">// top models</div>
                <div className="space-y-3">
                  {topModels.length ? (
                    topModels.map((model) => (
                      <ModelRow key={`${model.provider}-${model.model}`} model={model} />
                    ))
                  ) : (
                    <div className="text-xs text-[#858b98]">No model detail available yet.</div>
                  )}
                </div>
              </div>
              {additionalModels.length > 0 && (
                <div className="col-span-full border-t border-[#343840] px-5 pb-5 pt-4 sm:px-6">
                  <div className="mb-2 text-[10px] font-semibold text-[#858b98]">// other models used</div>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-2 min-[520px]:grid-cols-2 [&>span]:min-w-0">
                    {additionalModels.map((model) => (
                      <ModelComment key={`${model.provider}-${model.model}`} model={model} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex h-fit py-2.5 items-center justify-between gap-4 border-t border-[#343840] px-5 text-[10px] sm:px-6">
              <span className="inline-flex items-center gap-2 font-semibold">
                <img src="/favicon-32.png" alt="" className="h-4 w-4 rounded-[4px]" /> obol
              </span>
              <span className="text-[#858b98]">
                {data.rangeLabel === "Total"
                  ? `tracked_since: ${data.trackedSince}`
                  : "local · UTF-8 · usage snapshot"}
              </span>
            </div>
          </div>
          <aside className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold">Choose a window</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                Pick the story you want to share. The image stays local until you download it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {ranges.map((item) => (
                <button
                  className={`rounded-xl border px-3 py-2.5 text-left text-xs transition ${range === item.value ? "border-ink bg-ink font-semibold text-surface" : "border-hairline text-muted hover:bg-wash hover:text-ink"}`}
                  type="button"
                  key={item.value}
                  onClick={() => setRange(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-xs font-semibold text-surface transition hover:opacity-90"
                type="button"
                onClick={() => void exportShareImage(data)}
              >
                <span aria-hidden="true">↓</span> Download PNG
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
