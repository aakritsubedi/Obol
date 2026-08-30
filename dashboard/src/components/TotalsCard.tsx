import { useMemo } from "react";
import type { Report, Summary, WidgetConfig } from "../api";
import { formatCurrency, formatPeriod, formatTokens, heroFontSize } from "./format";
import { aggregateByProvider, aggregateModels, estimateCacheSavings, modelName, totalsFrom } from "./totals";
import { cardSurface } from "./ui";

interface Comparison {
  delta: number;
  ratio: number | null;
  baseline: number;
}

interface Props {
  report: Report | null;
  summary: Summary;
  config: WidgetConfig | null;
  todayComparison: Comparison | null;
  monthComparison: Comparison | null;
}

const savingsTooltip =
  "Estimated savings from prompt caching. Cached reads bill at ~10% of the base input rate, so each cached token saves ~90% of its input price. Prices are estimated per model family (Opus $15/M, Sonnet $3/M, Haiku $0.80/M, GPT/Gemini ≈$1.25/M); unknown models use the Sonnet-class rate.";

export default function TotalsCard({ report, summary, config }: Props) {
  const totals = totalsFrom(report);
  const cacheSavings = useMemo(() => estimateCacheSavings(report), [report]);
  const models = report ? aggregateModels(report) : [];
  const providerGroups = report ? aggregateByProvider(report) : [];
  const providerNames = new Set<string>();
  for (const row of report?.daily || []) {
    for (const provider of row.agents || [])
      providerNames.add(String(provider.agent ?? provider.name ?? provider.provider ?? "Unknown provider"));
  }
  const providerCount = providerNames.size || providerGroups.length || summary.agents.length;
  const modelCount = new Set(models.map((model) => modelName(model))).size;
  const since = report?.daily[0]?.period || summary.today.period;
  const currentMonth = summary.today.period.slice(0, 7);
  const monthToDate = report?.monthly.find((row) => row.period.startsWith(currentMonth))?.totalCost || 0;
  const dayOfMonth = Number(summary.today.period.slice(8, 10)) || 0;
  const daysInMonth = dayOfMonth
    ? new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0).getDate()
    : 0;
  const projectedMonthEnd = dayOfMonth && daysInMonth ? (monthToDate / dayOfMonth) * daysInMonth : 0;

  return (
    <section
      className={`min-w-0 p-7 [container-type:inline-size] max-[760px]:p-5 ${cardSurface}`}
      aria-labelledby="total-spend-heading"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div
          className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted"
          id="total-spend-heading"
        >
          History total
        </div>
        <span className="text-right text-[11px] text-muted max-[440px]:max-w-[120px]">
          since {since ? formatPeriod(since) : "usage began"}
        </span>
      </div>
      <div
        className="mt-4 font-semibold tabular-nums leading-[0.98] tracking-[-0.04em]"
        style={{ fontSize: heroFontSize(formatCurrency(totals.totalCost), 52) }}
      >
        {formatCurrency(totals.totalCost)}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted">
        {formatTokens(totals.totalTokens)} tokens across the selected history
        {cacheSavings.cacheShare !== null && cacheSavings.cacheShare > 0 && (
          <>
            {" · "}
            <strong className="font-semibold text-subtle">
              {(cacheSavings.cacheShare * 100).toFixed(1)}%
            </strong>{" "}
            served from cache
          </>
        )}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-hairline pt-5">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Input tokens</span>
          <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {formatTokens(totals.inputTokens)}
          </strong>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Output tokens</span>
          <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {formatTokens(totals.outputTokens)}
          </strong>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Cache read</span>
          <span title={savingsTooltip}>
            <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
              {formatTokens(cacheSavings.cacheReadTokens)}
            </strong>
            <small className="mt-1 block cursor-help text-[10px] text-ok-strong">
              +{formatTokens(totals.cacheCreationTokens)} created ·{" "}
              {cacheSavings.saved > 0 ? `~${formatCurrency(cacheSavings.saved)} saved` : "billed at ~10%"}
            </small>
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Models · providers</span>
          <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {modelCount} · {providerCount}
          </strong>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-hairline pt-5">
        <div>
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">
            Projected month-end
          </span>
          <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {formatCurrency(projectedMonthEnd)}
          </strong>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Burn rate</span>
          <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {formatCurrency(summary.burnRate.costPerHour)}/hr
          </strong>
        </div>
      </div>
      <p
        className={`mt-4 text-[10px] leading-relaxed ${summary.budgetStatus === "over" ? "text-over-strong" : summary.budgetStatus === "warn" ? "text-warn-strong" : "text-muted"}`}
      >
        {config?.monthlyBudget
          ? `${formatCurrency(projectedMonthEnd)} projected vs ${formatCurrency(config.monthlyBudget)} monthly budget`
          : "Set a monthly budget to see whether projected spend is on track"}
      </p>
    </section>
  );
}
