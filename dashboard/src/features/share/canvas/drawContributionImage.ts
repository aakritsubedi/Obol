import {
  buildContributionCalendar,
  type ContributionCalendar,
  trimFutureContribution,
} from "@shared/analytics/contribution";
import type { UsageRow } from "@shared/api";
import { formatCurrency, formatTokens } from "@shared/lib/format";
import { contributionExportRamp } from "@shared/ui/ramp";
import { drawWindowChrome } from "./chrome";
import { contributionGraphLayout } from "./layout";
import { downloadBlob, drawRoundedImage, loadImage, roundedRect } from "./primitives";

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
  context.fillText("Less", legendX, y + 7);
  [0, 1, 2, 3, 4].forEach((level, index) => {
    const swatchX = legendX + 31 + index * 16;
    context.fillStyle = contributionExportRamp[level as 0 | 1 | 2 | 3 | 4];
    roundedRect(context, swatchX, y - 3, 11, 11, 3);
    context.fill();
  });
  context.fillStyle = "#737987";
  context.fillText("More", legendX + 116, y + 7);

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
      context.fillStyle = contributionExportRamp[day.level];
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

export async function exportContributionImage(rows: UsageRow[]): Promise<void> {
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
  drawWindowChrome(context, {
    label: `usage/activity-${calendar.year}.md`,
    labelWidth: 320,
    rightLabel: "OBOL / ACTIVITY",
    rightX: canvasWidth - contentX,
    rightEdge: canvasWidth - 25,
  });
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
