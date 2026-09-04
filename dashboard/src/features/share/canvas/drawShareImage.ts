import { formatCurrency, formatTokens } from "@shared/lib/format";
import { providerColor, providerConfig, providerName } from "@shared/providers/catalog";
import {
  SHARE_ADDITIONAL_MODEL_COUNT,
  SHARE_TOP_MODEL_COUNT,
  type ShareData,
  type ShareModel,
  usageComments,
} from "../model/shareData";
import { drawWindowChrome } from "./chrome";
import { shareFonts, textWidth } from "./fonts";
import {
  SHARE_COLUMN_GAP,
  SHARE_CONTENT_PAD,
  SHARE_FRAME_INSET,
  SHARE_MODEL_ICON_STEP,
  SHARE_MODEL_METRIC_GAP,
  SHARE_USAGE_LABEL_Y,
  SHARE_USAGE_VALUE_Y,
  shareImageWidth,
} from "./layout";
import { downloadBlob, drawRoundedImage, fitCanvasText, loadImage, roundedRect } from "./primitives";

function drawModelComment(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  model: ShareModel,
  x: number,
  y: number,
  width: number,
): void {
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

export async function exportShareImage(data: ShareData): Promise<void> {
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
  const detailX = Math.max(
    SHARE_CONTENT_PAD + leftWidth + SHARE_COLUMN_GAP,
    canvasWidth - SHARE_CONTENT_PAD - rightWidth,
  );
  const metricsRight = canvasWidth - SHARE_CONTENT_PAD;
  const frameRight = canvasWidth - SHARE_FRAME_INSET;
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
  drawWindowChrome(context, {
    label: `usage/${data.rangeLabel.toLowerCase().replace(/ /g, "-")}.md`,
    rightLabel: "OBOL / USAGE",
    rightX: metricsRight,
    rightEdge: canvasWidth - 25,
  });
  context.fillStyle = "#9399a7";
  context.font = shareFonts.date;
  context.fillText(`// ${data.dateLabel.toLowerCase()}`, SHARE_CONTENT_PAD, 135);
  context.fillStyle = "#f5f6f8";
  context.font = shareFonts.cost;
  context.fillText(formatCurrency(data.cost), SHARE_CONTENT_PAD, 212);
  context.fillStyle = "#858b98";
  context.font = shareFonts.costLabel;
  context.fillText("total_spend", SHARE_CONTENT_PAD + 4, 237);
  context.font = shareFonts.usage;
  context.fillText("// total usage", SHARE_CONTENT_PAD, SHARE_USAGE_LABEL_Y);
  let usageX = SHARE_CONTENT_PAD;
  for (const part of usageComments(data)) {
    context.fillText("// ", usageX, SHARE_USAGE_VALUE_Y);
    usageX += textWidth(context, shareFonts.usage, "// ");
    context.fillStyle = "#86efac";
    context.fillText(part.value, usageX, SHARE_USAGE_VALUE_Y);
    usageX += textWidth(context, shareFonts.usage, part.value);
    context.fillStyle = "#858b98";
    context.fillText(` ${part.label}`, usageX, SHARE_USAGE_VALUE_Y);
    usageX += textWidth(context, shareFonts.usage, ` ${part.label}`) + 20;
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
