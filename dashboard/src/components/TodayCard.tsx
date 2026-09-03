import type { Summary } from "../api";
import { formatCurrency, formatTokens, heroFontSize } from "./format";
import { cardSurface } from "./ui";

export interface Last7Summary {
  totalCost: number;
  totalTokens: number;
  activeDays: number;
  averageDaily: number;
}

interface Props {
  summary: Summary;
  week: Last7Summary;
  trend: {
    points: { period: string; value: number }[];
    comparison: { ratio: number | null } | null;
  };
}

function Sparkline({ points }: { points: { period: string; value: number }[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map((point) => point.value), 1);
  const coordinates = points
    .map((point, index) => `${(index / (points.length - 1)) * 100},${28 - (point.value / max) * 24}`)
    .join(" ");
  return (
    <svg
      className="mt-4 h-9 w-full overflow-visible text-ink/70"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      role="img"
      aria-label="30-day spend trend"
    >
      <polyline
        points={coordinates}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function TodayCard({ summary, week, trend }: Props) {
  const modelCount = summary.today.modelsUsed?.length || 0;

  return (
    <section
      className={`flex min-w-0 flex-col p-7 [container-type:inline-size] max-[760px]:p-5 ${cardSurface}`}
      aria-labelledby="today-heading"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div
          className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted"
          id="today-heading"
        >
          Today
        </div>
        <span className="text-[11px] text-muted">Current day spend</span>
      </div>

      <div
        className="mt-4 font-semibold tabular-nums leading-[0.92] tracking-[-0.045em]"
        style={{ fontSize: heroFontSize(formatCurrency(summary.today.totalCost), 72, 56) }}
      >
        {formatCurrency(summary.today.totalCost)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>
          {summary.agents.length} {summary.agents.length === 1 ? "provider" : "providers"} active today ·{" "}
          {modelCount} {modelCount === 1 ? "model" : "models"}
        </span>
        {/* Spending above your own average is not a warning - only the budget
            can say that - so the up case is neutral and only a cheaper day
            earns the green. */}
        {trend.comparison && trend.comparison.ratio !== null && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${trend.comparison.ratio < 0 ? "bg-ok-soft text-ok-strong" : "bg-wash text-subtle"}`}
          >
            {trend.comparison.ratio < 0 ? "▼ " : "▲ "}
            {Math.abs(trend.comparison.ratio * 100).toFixed(0)}% vs 30d avg
          </span>
        )}
      </div>
      <Sparkline points={trend.points} />
      {/* Absorbs the slack so this card ends level with the taller totals card. */}
      <div className="min-h-6 grow" />

      <div className="border-t border-hairline pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">Last 7 days</div>
          <span className="text-[11px] text-muted">Trailing window ending today</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 min-[540px]:grid-cols-4">
          <div className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Spend</span>
            <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
              {formatCurrency(week.totalCost)}
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Daily average</span>
            <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
              {formatCurrency(week.averageDaily)}
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Active days</span>
            <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
              {week.activeDays}/7
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">Tokens</span>
            <strong className="mt-1.5 block text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
              {formatTokens(week.totalTokens)}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
