import { formatCurrency, formatPeriod } from "@shared/lib/format";
import { useState } from "react";

interface Props {
  points: { period: string; value: number }[];
  averageDaily: number;
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
export default function Sparkline({ points, averageDaily }: Props) {
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
            <button
              key={point.period}
              aria-label={`${formatPeriod(point.period)}: ${formatCurrency(point.value)}`}
              className="absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0"
              style={{ left: `${x(index)}%`, top: `${(y(point.value) / CHART_HEIGHT) * 100}%` }}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={
                  isToday || isActive
                    ? "h-2 w-2 rounded-full bg-ink ring-2 ring-card"
                    : "h-1 w-1 rounded-full bg-subtle opacity-60"
                }
              />
            </button>
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
