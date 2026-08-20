import type { Report, Summary } from "../api";
import { formatCurrency, formatPercent, formatPeriod, formatSignedCurrency, formatTokens } from "./format";
import { aggregateByProvider, aggregateModels, modelName, totalsFrom } from "./totals";

interface Comparison {
  delta: number;
  ratio: number | null;
  baseline: number;
}

interface Props {
  report: Report | null;
  summary: Summary;
  todayComparison: Comparison | null;
  monthComparison: Comparison | null;
}

function comparisonTone(value: number): string {
  return value > 0 ? "text-over-strong" : value < 0 ? "text-ok-strong" : "text-muted";
}

export default function TotalsCard({ report, summary, todayComparison, monthComparison }: Props) {
  const totals = totalsFrom(report);
  const models = report ? aggregateModels(report) : [];
  const providerGroups = report ? aggregateByProvider(report) : [];
  const providerNames = new Set<string>();
  for (const row of report?.daily || []) {
    for (const provider of row.agents || []) providerNames.add(String(provider.agent ?? provider.name ?? provider.provider ?? "Unknown provider"));
  }
  const providerCount = providerNames.size || providerGroups.length || summary.agents.length;
  const modelCount = new Set(models.map((model) => modelName(model))).size;
  const since = report?.daily[0]?.period || summary.today.period;

  return (
    <section className="min-w-0 border-l border-hairline py-8 pl-8 max-[760px]:border-l-0 max-[760px]:border-t max-[760px]:py-7 max-[760px]:pl-0" aria-labelledby="total-spend-heading">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted" id="total-spend-heading">History total</div>
        <span className="text-right text-[11px] text-muted max-[440px]:max-w-[120px]">since {since ? formatPeriod(since) : "usage began"}</span>
      </div>
      <div className="mt-4 text-[clamp(40px,5vw,64px)] font-bold tabular-nums leading-[0.98] tracking-[-0.05em]">{formatCurrency(totals.totalCost)}</div>
      <p className="mt-3 text-xs leading-5 text-muted">{formatTokens(totals.totalTokens)} tokens across the selected history</p>

      <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-5 border-t border-hairline py-2">
        <div className="min-w-0"><span className="block text-[10px] text-muted">Input tokens</span><strong className="mt-1.5 block text-lg font-semibold tabular-nums tracking-[-0.035em]">{formatTokens(totals.inputTokens)}</strong><small className="mt-1 block text-[10px] text-muted">history window</small></div>
        <div className="min-w-0"><span className="block text-[10px] text-muted">Output tokens</span><strong className="mt-1.5 block text-lg font-semibold tabular-nums tracking-[-0.035em]">{formatTokens(totals.outputTokens)}</strong><small className="mt-1 block text-[10px] text-muted">history window</small></div>
        <div className="min-w-0"><span className="block text-[10px] text-muted">Cache read</span><strong className="mt-1.5 block text-lg font-semibold tabular-nums tracking-[-0.035em]">{formatTokens(totals.cacheReadTokens)}</strong><small className="mt-1 block text-[10px] text-muted">+{formatTokens(totals.cacheCreationTokens)} created</small></div>
        <div className="min-w-0"><span className="block text-[10px] text-muted">Models · providers</span><strong className="mt-1.5 block text-lg font-semibold tabular-nums tracking-[-0.035em]">{modelCount} · {providerCount}</strong><small className="mt-1 block text-[10px] text-muted">in history</small></div>
      </div>
    </section>
  );
}
