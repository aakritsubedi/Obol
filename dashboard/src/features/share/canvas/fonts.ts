export const shareFonts = {
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

export function textWidth(context: CanvasRenderingContext2D, font: string, value: string): number {
  context.font = font;
  return context.measureText(value).width;
}
