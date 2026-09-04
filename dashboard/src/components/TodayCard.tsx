import { useState } from "react";
import type { Summary } from "../api";
import { formatCurrency, formatPeriod, formatTokens, heroFontSize } from "./format";
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
    /** Mean daily spend over the window, today excluded — what the badge compares against. */
    averageDaily: number;
    comparison: { ratio: number | null } | null;
  };
}

const CHART_HEIGHT = 40;
const CHART_TOP = 4;

/**
 * One day's spend per point, over the trailing 30 days, ending today.
 *
 * The line alone said none of that, so it now carries the things that make a
 * shape mean something: a zero-anchored area, the same 30-day average the
 * badge above compares against, a dot per day, and today called out as the
 * last one. The vertical scale is stretched by `preserveAspectRatio="none"`,
 * which would squash any circle drawn inside the SVG — so the dots are HTML
 * positioned over it, where they stay round and can take a hover target.
 */
function Sparkline({
  points,
  averageDaily,
}: {
  points: { period: string; value: number }[];
  averageDaily: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (points.length < 2) return null;

  const max = Math.max(...points.map((point) => point.value), 1);
  const x = (index: number): number => (index / (points.length - 1)) * 100;
  const y = (value: number): number => CHART_HEIGHT - (value / max) * (CHART_HEIGHT - CHART_TOP);
  const coordinates = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const averageY = y(averageDaily);
  const todayIndex = points.length - 1;
  const active = hovered ?? todayIndex;
  const activePoint = points[active];

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-3 text-[10px] text-muted">
        <span className="uppercase tracking-[0.06em]">Daily spend · last {points.length} days</span>
        <span className="tabular-nums">peak {formatCurrency(max)}</span>
      </div>

      <div className="relative mt-2">
        <svg
          className="block h-14 w-full text-ink/70"
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Daily spend for the last ${points.length} days, averaging ${formatCurrency(averageDaily)} a day`}
        >
          <polygon
            points={`0,${CHART_HEIGHT} ${coordinates} 100,${CHART_HEIGHT}`}
            fill="currentColor"
            opacity=".07"
          />
          {averageDaily > 0 && (
            <line
              x1="0"
              x2="100"
              y1={averageY}
              y2={averageY}
              className="stroke-muted"
              strokeDasharray="4 3"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polyline
            points={coordinates}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {points.map((point, index) => {
          const isToday = index === todayIndex;
          const isActive = index === active;
          return (
            <span
              key={point.period}
              className="absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${x(index)}%`, top: `${(y(point.value) / CHART_HEIGHT) * 100}%` }}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                aria-hidden="true"
                className={
                  isToday || isActive
                    ? "h-2 w-2 rounded-full bg-ink ring-2 ring-card"
                    : "h-1 w-1 rounded-full bg-subtle opacity-60"
                }
              />
            </span>
          );
        })}
      </div>

      {/* The window's ends, and whichever day is being pointed at between them. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[10px] tabular-nums text-muted">
        <span>{formatPeriod(points[0].period)}</span>
        <span className="font-semibold text-subtle">
          {hovered === null ? "Today" : formatPeriod(activePoint.period)} ·{" "}
          {formatCurrency(activePoint.value)}
        </span>
        <span>{formatPeriod(points[todayIndex].period)}</span>
      </div>
    </div>
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
      <Sparkline points={trend.points} averageDaily={trend.averageDaily} />
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
