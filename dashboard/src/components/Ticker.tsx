import type { Summary } from "../api";
import { displayName, formatCurrency } from "./format";
import { providerColor } from "./CostChart";

interface Props { summary: Summary; }

export default function Ticker({ summary }: Props) {
  const total = summary.today.totalCost;
  const providers = [...summary.agents].sort((a, b) => b.totalCost - a.totalCost);
  return <aside className="fixed bottom-4 left-1/2 z-30 flex min-h-11 w-[calc(100%-36px)] max-w-[780px] -translate-x-1/2 items-center gap-3.5 overflow-hidden rounded-full bg-ink px-3.5 py-2 text-surface shadow-[0_12px_30px_rgba(0,0,0,.18)]" aria-label="Today's provider spend"><span className="flex shrink-0 border-r border-surface/20 pr-3.5 text-[10px] font-semibold uppercase text-surface/70">Today</span><div className="flex min-w-0 items-center gap-[18px] overflow-x-auto">{providers.map((provider) => { const share = total > 0 ? Math.max(0, provider.totalCost / total) : 0; const active = provider.totalCost > 0; return <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-surface/70" key={provider.agent}><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: providerColor(provider.agent) }} /><strong className="font-semibold text-surface">{displayName(provider.agent)}</strong><span>{formatCurrency(provider.totalCost)}</span><em className={`not-italic tabular-nums ${active ? "text-ok" : "text-over"}`}>{active ? "↗" : "↘"} {Math.round(share * 100)}%</em></span>; })}</div></aside>;
}
