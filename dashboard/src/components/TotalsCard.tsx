import { useMemo, useState } from "react";
import type { Report, Summary, WidgetConfig } from "../api";
import { ProviderLogo, providerColor, providerName } from "../providers";
import { formatCurrency, formatPeriod, formatTokens, heroFontSize } from "./format";
import {
  budgetOutlook,
  estimateCacheSavings,
  type MonthProjection,
  monthProjection,
  totalsFrom,
} from "./totals";
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

// What the month actually booked, behind the projection it was extrapolated
// from. Hover or focus opens it: the projection is the number worth acting on,
// so the evidence for it sits one gesture away rather than crowding the card.
function MonthDetail({ projection }: { projection: MonthProjection }) {
  const { actual, providers } = projection;
  const rows: Array<[string, string]> = [
    ["Input", formatTokens(actual.inputTokens)],
    ["Output", formatTokens(actual.outputTokens)],
    ["Cache read", formatTokens(actual.cacheReadTokens)],
    ["Cache write", formatTokens(actual.cacheCreationTokens)],
  ];

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-[236px] rounded-control border border-hairline bg-card px-3 py-2.5 text-[10px] text-ink shadow-pop"
    >
      <div className="font-semibold uppercase tracking-[0.06em] text-muted">Booked this month</div>
      <dl className="mt-1.5 flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div className="flex items-baseline justify-between gap-3" key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-hairline pt-1.5">
          <dt className="text-muted">Total tokens</dt>
          <dd className="font-semibold tabular-nums">{formatTokens(actual.totalTokens)}</dd>
        </div>
      </dl>

      {providers.length > 0 && (
        <>
          <div className="mt-2.5 border-t border-hairline pt-2 font-semibold uppercase tracking-[0.06em] text-muted">
            Cost by provider
          </div>
          <dl className="mt-1.5 flex flex-col gap-1">
            {providers.map((provider) => (
              <div className="flex items-baseline justify-between gap-3" key={provider.agent}>
                <dt className="flex min-w-0 items-center gap-1.5 truncate">
                  <ProviderLogo agent={provider.agent} size={12} color={providerColor(provider.agent)} />
                  {providerName(provider.agent)}
                </dt>
                <dd className="shrink-0 tabular-nums">{formatCurrency(provider.totalCost)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

export default function TotalsCard({ report, summary, config }: Props) {
  const totals = totalsFrom(report);
  const cacheSavings = useMemo(() => estimateCacheSavings(report), [report]);
  const since = report?.daily[0]?.period || summary.today.period;
  const projection = monthProjection(report, summary.today.period);
  const [detailOpen, setDetailOpen] = useState(false);
  const outlook = budgetOutlook(projection.projected, config?.monthlyBudget, config?.warningThreshold);
  // The projected fill keeps its 2% floor so a barely-started month still shows
  // something; what is booked is drawn at its true share, floor included, so
  // the solid head never overstates the spend.
  const projectedWidth = outlook ? Math.min(100, Math.max(2, outlook.ratio * 100)) : 0;
  const bookedWidth = outlook ? Math.min(projectedWidth, (projection.monthToDate / outlook.budget) * 100) : 0;

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
        {projection.monthToDate > 0 && (
          <div className="relative mt-1 inline-flex">
            <button
              type="button"
              className="cursor-help border-0 bg-transparent p-0 text-left text-[11px] leading-relaxed text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
              aria-expanded={detailOpen}
              onMouseEnter={() => setDetailOpen(true)}
              onMouseLeave={() => setDetailOpen(false)}
              onFocus={() => setDetailOpen(true)}
              onBlur={() => setDetailOpen(false)}
              onClick={() => setDetailOpen((open) => !open)}
            >
              {outlook && (
                <span
                  aria-hidden="true"
                  className={`mr-1.5 inline-block h-1.5 w-3 shrink-0 rounded-full align-middle ${budgetFill[outlook.level]}`}
                />
              )}
              <strong className="font-semibold tabular-nums text-subtle">
                {formatCurrency(projection.monthToDate)}
              </strong>{" "}
              actually spent so far · {formatTokens(projection.actual.totalTokens)} tok
            </button>
            {detailOpen && <MonthDetail projection={projection} />}
          </div>
        )}
        {outlook ? (
          <>
            {/* The fill is the projection; the solid head of it is what has
                actually been booked, so the bar separates the measurement from
                the extrapolation instead of showing one undifferentiated
                guess. */}
            <div
              className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-track"
              role="img"
              aria-label={`${formatCurrency(projection.monthToDate)} spent so far and ${formatCurrency(outlook.projected)} projected, against a ${formatCurrency(outlook.budget)} monthly budget`}
            >
              <span
                className={`block h-full rounded-full opacity-40 ${budgetFill[outlook.level]}`}
                style={{ width: `${projectedWidth}%` }}
              />
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${budgetFill[outlook.level]}`}
                style={{ width: `${bookedWidth}%` }}
              />
              {/* Only worth a tick once the two differ enough to read as two
                  segments — on day 30 they converge and the notch would just
                  clip the end of the bar. */}
              {projectedWidth - bookedWidth > 1 && bookedWidth > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-card"
                  style={{ left: `${bookedWidth}%` }}
                />
              )}
            </div>
            <p className={`mt-2 text-[9px] leading-relaxed ${budgetTone[outlook.level]}`}>
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
