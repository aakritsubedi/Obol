import { useMemo } from "react";
import type { Report, Summary, WidgetConfig } from "../api";
import { formatCurrency, formatPeriod, formatTokens, heroFontSize } from "./format";
import { budgetOutlook, estimateCacheSavings, monthProjection, totalsFrom } from "./totals";
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

// Amber is "watch this", red is "the pace does not fit the budget". They are
// the only verdict this card renders, so nothing above the bar competes with
// them for the same reading.
const budgetTone: Record<"ok" | "warn" | "over", string> = {
  ok: "text-muted",
  warn: "text-warn-strong",
  over: "text-over-strong",
};

const budgetFill: Record<"ok" | "warn" | "over", string> = {
  ok: "bg-subtle",
  warn: "bg-warn",
  over: "bg-over",
};

const savingsTooltip =
  "Estimated savings from prompt caching. Cached reads bill at ~10% of the base input rate, so each cached token saves ~90% of its input price. Prices are estimated per model family (Opus $15/M, Sonnet $3/M, Haiku $0.80/M, GPT/Gemini ≈$1.25/M); unknown models use the Sonnet-class rate.";

export default function TotalsCard({ report, summary, config }: Props) {
  const totals = totalsFrom(report);
  const cacheSavings = useMemo(() => estimateCacheSavings(report), [report]);
  const since = report?.daily[0]?.period || summary.today.period;
  const projection = monthProjection(report, summary.today.period);
  const outlook = budgetOutlook(projection.projected, config?.monthlyBudget, config?.warningThreshold);

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
      <p className="mt-1 text-[11px] leading-5 text-muted">
        {formatTokens(totals.totalTokens)} tokens across the selected history
        {cacheSavings.cacheShare !== null && cacheSavings.cacheShare > 0 && (
          <>
            {" · "}
            <strong className="font-semibold text-subtle">
              {(cacheSavings.cacheShare * 100).toFixed(1)}%
            </strong>{" "}
            cache
          </>
        )}
      </p>

      {/* Input and output stack in one column; cache read takes the other and
          spans both rows, because its savings line needs the width that three
          equal columns could not give it. */}
      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-hairline pt-5">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Input tokens</span>
          <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {formatTokens(totals.inputTokens)}
          </strong>
        </div>
        <div className="row-span-2 min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Cache read</span>
          <span title={savingsTooltip}>
            <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
              {formatTokens(cacheSavings.cacheReadTokens)}
            </strong>
            <small className="mt-1 block cursor-help text-[10px] leading-relaxed text-ok-strong">
              +{formatTokens(totals.cacheCreationTokens)} created ·{" "}
              {cacheSavings.saved > 0 ? `~${formatCurrency(cacheSavings.saved)} saved` : "billed at ~10%"}
            </small>
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Output tokens</span>
          <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {formatTokens(totals.outputTokens)}
          </strong>
        </div>
      </div>
      {/* Whether the month lands inside the budget is the one number here that
          can change what you do next, so it gets the bar and the last word
          rather than a line of fine print under eight other statistics. */}
      <div className="mt-5 border-t border-hairline pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.06em] text-muted">Projected month-end</span>
          <span className="text-[10px] text-muted">
            Day {projection.dayOfMonth || "—"} of {projection.daysInMonth || "—"}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <strong className="text-[19px] font-semibold tabular-nums tracking-[-0.03em]">
            {formatCurrency(projection.projected)}
          </strong>
          {outlook && (
            <span className={`text-[11px] font-semibold tabular-nums ${budgetTone[outlook.level]}`}>
              {Math.round(outlook.ratio * 100)}% of budget
            </span>
          )}
        </div>
        {outlook ? (
          <>
            <div
              className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-track"
              role="img"
              aria-label={`${formatCurrency(outlook.projected)} projected against a ${formatCurrency(outlook.budget)} monthly budget`}
            >
              <span
                className={`block h-full rounded-full ${budgetFill[outlook.level]}`}
                style={{ width: `${Math.min(100, Math.max(2, outlook.ratio * 100))}%` }}
              />
            </div>
            <p className={`mt-2 text-[10px] leading-relaxed ${budgetTone[outlook.level]}`}>
              {outlook.level === "over"
                ? `${formatCurrency(outlook.overage)} over the ${formatCurrency(outlook.budget)} budget at this pace`
                : `${formatCurrency(outlook.budget - outlook.projected)} of headroom left in the ${formatCurrency(outlook.budget)} budget`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            Set a monthly budget to see whether this pace stays inside it.
          </p>
        )}
      </div>
    </section>
  );
}
