import type { Summary } from "../api";
import { formatCurrency, formatTokens } from "./format";

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
      className="mt-3 h-8 w-full overflow-visible"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      role="img"
      aria-label="30-day spend trend"
    >
      <polyline
        points={coordinates}
        fill="none"
        className="stroke-ink"
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
      className="min-w-0 rounded-[24px] border border-hairline bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,.04),0_14px_36px_rgba(0,0,0,.045)] max-[760px]:rounded-[20px] max-[760px]:p-[22px]"
      aria-labelledby="today-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="today-heading"
          >
            Today
          </div>
          <p className="mt-1 text-xs text-muted">Current day spend</p>
        </div>
      </div>

      <div className="mt-4 text-[clamp(58px,7vw,84px)] font-bold tabular-nums leading-[0.92] tracking-[-0.055em]">
        {formatCurrency(summary.today.totalCost)}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {summary.agents.length} {summary.agents.length === 1 ? "provider" : "providers"} active today ·{" "}
          {modelCount} {modelCount === 1 ? "model" : "models"}
        </span>
        {trend.comparison && trend.comparison.ratio !== null && (
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${trend.comparison.ratio < 0 ? "bg-ok-soft text-ok-strong" : "bg-warn-soft text-warn-strong"}`}
          >
            {trend.comparison.ratio < 0 ? "−" : "+"}
            {Math.abs(trend.comparison.ratio * 100).toFixed(0)}% vs 30d avg
          </span>
        )}
      </div>
      <Sparkline points={trend.points} />

      <div className="mt-5 border-t border-hairline pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-[-0.015em]">Last 7 days</div>
            <p className="mt-1 text-xs text-muted">Trailing window ending today</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 min-[540px]:grid-cols-4">
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Spend</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {formatCurrency(week.totalCost)}
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Daily average</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {formatCurrency(week.averageDaily)}
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Active days</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {week.activeDays}/7
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Tokens</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {formatTokens(week.totalTokens)}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
