import { shareFonts, textWidth } from "./fonts";
import { roundedRect } from "./primitives";

export function drawWindowChrome(
  context: CanvasRenderingContext2D,
  options: { label: string; labelWidth?: number; rightLabel: string; rightX: number; rightEdge?: number },
): void {
  const labelWidth =
    options.labelWidth ?? Math.max(260, textWidth(context, shareFonts.chrome, options.label) + 36);
  context.fillStyle = "#1d1f25";
  context.fillRect(25, 25, (options.rightEdge ?? options.rightX) - 25, 64);
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
  roundedRect(context, 145, 42, labelWidth, 30, 7);
  context.fill();
  context.fillStyle = "#cdd1da";
  context.font = shareFonts.chrome;
  context.fillText(options.label, 163, 62);
  context.fillStyle = "#737987";
  context.font = shareFonts.chromeMuted;
  context.textAlign = "right";
  context.fillText(options.rightLabel, options.rightX, 62);
  context.textAlign = "left";
}
