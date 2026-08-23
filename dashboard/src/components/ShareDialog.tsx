import { useMemo, useState } from "react";
import type { ModelBreakdown, Report, Summary } from "../api";
import { ProviderLogo, providerColor, providerConfig, providerName } from "../providers";
import { formatCurrency, formatPeriod, formatTokens, numberValue } from "./format";
import { modelName } from "./totals";

type ShareRange = "today" | "week" | "month" | "total";

interface Props {
  report: Report | null;
  summary: Summary;
  onClose: () => void;
}

interface ShareModel {
  model: string;
  provider: string;
  cost: number;
  tokens: number;
}

interface ShareData {
  rangeLabel: string;
  dateLabel: string;
  cost: number;
  tokens: number;
  models: ShareModel[];
  modelCount: number;
  trackedSince: string;
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

function breakdownForRow(row: { modelBreakdowns?: ModelBreakdown[]; agents?: Array<{ agent?: string; modelBreakdowns?: ModelBreakdown[] }> }) {
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

function buildShareData(report: Report | null, summary: Summary, range: ShareRange): ShareData {
  const rows = rangeRows(report, summary, range);
  const fallback = range === "today" ? summary.today : null;
  const cost = rows.length ? rows.reduce((sum, row) => sum + numberValue(row.totalCost), 0) : fallback?.totalCost || 0;
  const tokens = rows.length ? rows.reduce((sum, row) => sum + numberValue(row.totalTokens), 0) : fallback?.totalTokens || 0;
  const models = new Map<string, ShareModel>();
  for (const row of rows) {
    for (const entry of breakdownForRow(row)) {
      const key = `${entry.provider}\u0000${modelName(entry.model)}`;
      const current = models.get(key) || { model: modelName(entry.model), provider: entry.provider, cost: 0, tokens: 0 };
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
  const dateLabel = range === "total" ? "All tracked usage" : range === "month" ? "Current month" : range === "week" ? "Trailing 7 days" : formatPeriod(summary.today.period);
  return {
    rangeLabel: ranges.find((item) => item.value === range)?.label || "Usage",
    dateLabel,
    cost,
    tokens,
    models: [...models.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens).slice(0, 5),
    modelCount: models.size,
    trackedSince: first ? formatPeriod(first) : "usage began",
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

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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

async function exportShareImage(data: ShareData) {
  const providerImages = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    [...new Set(data.models.map((model) => model.provider))].map(async (provider) => {
      const id = providerConfig(provider).id;
      providerImages.set(provider, id ? await loadImage(`/providers/${id}.png`) : null);
    }),
  );
  const obolIcon = await loadImage("/favicon-32.png");
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  const canvasHeight = Math.max(560, 356 + data.models.length * 68);
  canvas.height = canvasHeight;
  const footerY = canvasHeight - 74;
  const outerHeight = canvasHeight - 48;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#111216";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  roundedRect(context, 24, 24, 1152, outerHeight, 18);
  context.clip();
  context.strokeStyle = "#343840";
  context.lineWidth = 2;
  context.fillStyle = "#1d1f25";
  context.fillRect(25, 25, 1150, 64);
  [["#f06b60", 55], ["#f1bd4a", 79], ["#59bf55", 103]].forEach(([color, x]) => {
    context.fillStyle = String(color);
    context.beginPath();
    context.arc(Number(x), 57, 7, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = "#2a2d35";
  roundedRect(context, 145, 42, 260, 30, 7);
  context.fill();
  context.fillStyle = "#cdd1da";
  context.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(`usage/${data.rangeLabel.toLowerCase().replace(/ /g, "-")}.md`, 163, 62);
  context.fillStyle = "#737987";
  context.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText("OBOL / USAGE", 1030, 62);
  context.strokeStyle = "#343840";
  context.beginPath();
  context.moveTo(528, 89);
  context.lineTo(528, footerY);
  context.stroke();
  context.fillStyle = "#9399a7";
  context.font = "500 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(`// ${data.dateLabel.toLowerCase()}`, 62, 135);
  context.fillStyle = "#f5f6f8";
  context.font = "700 62px -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(formatCurrency(data.cost), 62, 212);
  context.fillStyle = "#858b98";
  context.font = "500 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText("total_spend", 66, 237);
  const metrics = [["Tokens", formatTokens(data.tokens)], ["Models", String(data.modelCount)]];
  metrics.forEach(([label, value], index) => {
    const x = 62 + index * 142;
    context.fillStyle = "#1d2026";
    roundedRect(context, x, 274, 128, 34, 17);
    context.fill();
    context.fillStyle = "#cdd1da";
    context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(`${value} ${label.toLowerCase()}`, x + 14, 296);
  });
  context.fillStyle = "#858b98";
  context.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText("// top_models", 570, 135);
  for (const [index, model] of data.models.entries()) {
    const y = 177 + index * 68;
    const color = providerColor(model.provider);
    if (!drawRoundedImage(context, providerImages.get(model.provider) || null, 570, y - 15, 22, 6)) {
      context.fillStyle = color;
      roundedRect(context, 570, y - 15, 22, 22, 6);
      context.fill();
    }
    context.fillStyle = "#e7e9ed";
    context.font = "600 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(model.model, 602, y);
    context.fillStyle = "#737987";
    context.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(providerName(model.provider).toLowerCase(), 602, y + 18);
    context.fillStyle = "#aeb4bf";
    context.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(`${formatCurrency(model.cost)} · ${formatTokens(model.tokens)}`, 965, y + 5);
  }
  context.strokeStyle = "#343840";
  context.beginPath();
  context.moveTo(25, footerY);
  context.lineTo(1175, footerY);
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
  context.fillText(data.rangeLabel === "Total" ? `tracked_since: ${data.trackedSince}` : "local · UTF-8 · usage snapshot", 888, canvasHeight - 43);
  context.restore();
  context.strokeStyle = "#343840";
  context.lineWidth = 2;
  roundedRect(context, 24, 24, 1152, outerHeight, 18);
  context.stroke();
  canvas.toBlob((blob) => blob && downloadBlob(`obol-${data.rangeLabel.toLowerCase().replace(/ /g, "-")}.png`, blob), "image/png");
}

function ModelRow({ model }: { model: ShareModel }) {
  const color = providerColor(model.provider);
  return (
    <div className="flex items-center gap-2.5">
      <ProviderLogo agent={model.provider} size={26} color={color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-semibold">{model.model}</span>
          <span className="shrink-0 tabular-nums text-[#aeb4bf]">{formatCurrency(model.cost)} · {formatTokens(model.tokens)}</span>
        </div>
        <p className="mt-1 text-[9px] text-[#737987]">{providerName(model.provider).toLowerCase()}</p>
      </div>
    </div>
  );
}

export default function ShareDialog({ report, summary, onClose }: Props) {
  const [range, setRange] = useState<ShareRange>("today");
  const data = useMemo(() => buildShareData(report, summary, range), [range, report, summary]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/35 px-4 py-8 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-[920px] overflow-hidden rounded-[24px] border border-hairline bg-card text-ink shadow-[0_24px_80px_rgba(0,0,0,.24)]" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Share usage</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.03em]" id="share-dialog-title">Create a social card</h2>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-full border border-hairline text-muted transition hover:bg-wash hover:text-ink" type="button" onClick={onClose} aria-label="Close share dialog">×</button>
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div className="overflow-hidden rounded-[14px] border border-[#343840] bg-[#111216] font-mono text-[#f5f6f8] shadow-[0_18px_40px_rgba(0,0,0,.18)]">
            <div className="flex h-11 items-center gap-2 border-b border-[#343840] bg-[#1d1f25] px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f06b60]" /><span className="h-2.5 w-2.5 rounded-full bg-[#f1bd4a]" /><span className="h-2.5 w-2.5 rounded-full bg-[#59bf55]" />
              <span className="ml-3 rounded-md bg-[#2a2d35] px-3 py-1 text-[10px] font-semibold text-[#cdd1da]">usage/{data.rangeLabel.toLowerCase().replace(/ /g, "-")}.md</span>
              <span className="ml-auto text-[9px] text-[#737987]">OBOL / USAGE</span>
            </div>
            <div className="grid grid-cols-[.85fr_1.15fr] divide-x divide-[#343840] max-[640px]:grid-cols-1 max-[640px]:divide-x-0">
              <div className="p-5 sm:p-6">
                <div className="text-[10px] text-[#858b98]">// {data.dateLabel.toLowerCase()}</div>
                <div className="mt-5 text-4xl font-bold tracking-[-0.07em] sm:text-5xl">{formatCurrency(data.cost)}</div>
                <div className="mt-1 text-[10px] text-[#858b98]">total_spend</div>
                <div className="mt-7 flex flex-wrap gap-2">
                  {[[formatTokens(data.tokens), "tokens"], [String(data.modelCount), "models"]].map(([value, label]) => <span className="rounded-full bg-[#1d2026] px-3 py-2 text-[10px] font-semibold text-[#cdd1da]" key={label}>{value} {label}</span>)}
                </div>
              </div>
              <div className="p-5 sm:p-6">
                <div className="mb-5 text-[10px] font-semibold text-[#858b98]">// top_models</div>
                <div className="space-y-4">
                  {data.models.length ? data.models.map((model) => <ModelRow key={`${model.provider}-${model.model}`} model={model} />) : <div className="text-xs text-[#858b98]">No model detail available yet.</div>}
                </div>
              </div>
            </div>
            <div className="flex h-10 items-center justify-between gap-4 border-t border-[#343840] px-5 text-[10px] sm:px-6">
              <span className="inline-flex items-center gap-2 font-semibold"><img src="/favicon-32.png" alt="" className="h-4 w-4 rounded-[4px]" /> obol</span><span className="text-[#858b98]">{data.rangeLabel === "Total" ? `tracked_since: ${data.trackedSince}` : "local · usage snapshot"}</span>
            </div>
          </div>
          <aside className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold">Choose a window</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">Pick the story you want to share. The image stays local until you download it.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {ranges.map((item) => <button className={`rounded-xl border px-3 py-2.5 text-left text-xs transition ${range === item.value ? "border-ink bg-ink font-semibold text-surface" : "border-hairline text-muted hover:bg-wash hover:text-ink"}`} type="button" key={item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}
            </div>
            <button className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-xs font-semibold text-surface transition hover:opacity-90" type="button" onClick={() => void exportShareImage(data)}><span aria-hidden="true">↓</span> Download PNG</button>
          </aside>
        </div>
      </div>
    </div>
  );
}
