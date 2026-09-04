import type { UsageRow } from "@shared/api";
import { formatCurrency, formatPeriod, formatTokens } from "@shared/lib/format";
import { projectColor, providerColor, providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import { emptyState } from "@shared/ui/tokens";
import { useEffect, useMemo, useState } from "react";
import { type ChartMetric, chartPoints, labelIndexes, niceScale } from "../model/chart";

interface Props {
  rows: UsageRow[];
  metric: ChartMetric;
  groupBy?: "agent" | "project";
}

export default function CostChart({ rows, metric, groupBy = "agent" }: Props) {
  const points = useMemo(() => chartPoints(rows, metric, groupBy), [groupBy, metric, rows]);
  const colorFor = (key: string): string =>
    groupBy === "project" ? (key === "__other__" ? "#8B8F98" : projectColor(key)) : providerColor(key);
  const groupKeys = useMemo(
    () =>
      [...new Set(points.flatMap((point) => point.groups.map((group) => group.key)))].sort((left, right) => {
        const leftValue = points.reduce(
          (sum, point) => sum + (point.groups.find((group) => group.key === left)?.value || 0),
          0,
        );
        const rightValue = points.reduce(
          (sum, point) => sum + (point.groups.find((group) => group.key === right)?.value || 0),
          0,
        );
        return rightValue - leftValue;
      }),
    [points],
  );
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(() => new Set());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (groupKeys.length === 0) {
      setHiddenGroups(new Set());
      setHoveredIndex(null);
      return;
    }
    setHiddenGroups(new Set());
    setHoveredIndex(null);
  }, [groupKeys]);

  const visiblePoints = points.map((point) => ({
    ...point,
    groups: point.groups.filter((group) => !hiddenGroups.has(group.key)),
  }));
  const rawMax = Math.max(
    1,
    ...visiblePoints.map((point) => point.groups.reduce((sum, group) => sum + group.value, 0)),
  );
  const scale = niceScale(rawMax);
  const average = visiblePoints.length
    ? visiblePoints.reduce(
        (sum, point) => sum + point.groups.reduce((total, group) => total + group.value, 0),
        0,
      ) / visiblePoints.length
    : 0;
  const width = 720;
  const height = 250;
  const left = 48;
  const right = 12;
  const top = 18;
  const bottom = 34;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const slotWidth = points.length ? chartWidth / points.length : chartWidth;
  const barWidth = points.length ? Math.max(5, Math.min(28, slotWidth - 5)) : 12;
  const xLabels = labelIndexes(points.length);
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];
  const hoveredGroups = hoveredPoint?.groups.filter((group) => !hiddenGroups.has(group.key)) || [];
  const hoveredX = hoveredIndex === null ? 0 : left + (hoveredIndex + 0.5) * slotWidth;
  const averageY = top + chartHeight - (average / scale.max) * chartHeight;

  const averageBadge = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline bg-card px-2 py-0.5 text-[10px] text-muted shadow-card">
      <span className="inline-block h-0 w-3 border-current border-t border-dashed opacity-70" />
      avg
      <strong className="font-medium tabular-nums text-ink">
        {metric === "cost" ? formatCurrency(average) : formatTokens(average)}
      </strong>
    </span>
  );

  function toggleGroup(key: string, compare = false) {
    setHiddenGroups((current) => {
      const visible = groupKeys.filter((group) => !current.has(group));
      if (!compare) {
        if (visible.length === 1 && visible[0] === key) return new Set();
        return new Set(groupKeys.filter((group) => group !== key));
      }
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="min-h-[280px]">
      {points.length === 0 ? (
        <div className={emptyState}>No history available yet.</div>
      ) : (
        <>
          {average > 0 && <div className="mb-2 hidden justify-end max-[760px]:flex">{averageBadge}</div>}
          <div className="flex items-start gap-2">
            <div className="relative min-w-0 flex-1">
              <svg
                className="block h-auto w-full overflow-visible"
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={`${metric} over time`}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {[0, 1, 2, 3, 4].map((tick) => {
                  const ratio = tick / 4;
                  const y = top + chartHeight * (1 - ratio);
                  return (
                    <g key={tick}>
                      <line
                        x1={left}
                        x2={width - right}
                        y1={y}
                        y2={y}
                        className="stroke-hairline"
                        strokeWidth="1"
                      />
                      <text x={left - 8} y={y + 4} textAnchor="end" className="fill-muted text-[10px]">
                        {metric === "cost"
                          ? formatCurrency(scale.max * ratio)
                          : formatTokens(scale.max * ratio)}
                      </text>
                    </g>
                  );
                })}
                {points.map((point, index) => {
                  const day = new Date(`${point.period.slice(0, 10)}T12:00:00`).getDay();
                  if (day !== 0 && day !== 6) return null;
                  return (
                    <rect
                      key={`weekend-${point.period}`}
                      x={left + index * slotWidth}
                      y={top}
                      width={slotWidth}
                      height={chartHeight}
                      fill="currentColor"
                      className="text-wash"
                      opacity=".7"
                    />
                  );
                })}
                {visiblePoints.map((point, index) => {
                  const x = left + (index + 0.5) * slotWidth - barWidth / 2;
                  let accumulated = 0;
                  return (
                    <g key={point.period}>
                      {point.groups.map((group) => {
                        const h = (group.value / scale.max) * chartHeight;
                        const y = top + chartHeight - accumulated - h;
                        accumulated += h;
                        return (
                          <rect
                            key={group.key}
                            x={x}
                            y={y}
                            width={barWidth}
                            height={Math.max(0, h)}
                            rx="4"
                            fill={colorFor(group.key)}
                          />
                        );
                      })}
                      {xLabels.has(index) && (
                        <text
                          x={x + barWidth / 2}
                          y={height - 10}
                          textAnchor="middle"
                          className="fill-muted text-[10px]"
                        >
                          {formatPeriod(point.period)}
                        </text>
                      )}
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: The transparent SVG hit area is the chart's hover target. */}
                      <rect
                        x={left + index * slotWidth}
                        y={top}
                        width={slotWidth}
                        height={chartHeight}
                        fill="transparent"
                        onMouseEnter={() => setHoveredIndex(index)}
                      />
                    </g>
                  );
                })}
                {average > 0 && (
                  <line
                    x1={left}
                    x2={width}
                    y1={averageY}
                    y2={averageY}
                    className="stroke-muted"
                    strokeDasharray="5 4"
                    strokeWidth="1"
                  />
                )}
                {hoveredIndex !== null && (
                  <line
                    x1={hoveredX}
                    x2={hoveredX}
                    y1={top}
                    y2={top + chartHeight}
                    className="stroke-ink"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                    opacity=".45"
                  />
                )}
              </svg>
              {hoveredPoint && (
                <div
                  className="pointer-events-none absolute top-2 z-10 w-[190px] -translate-x-1/2 rounded-control border border-hairline bg-card px-3 py-2 text-[10px] text-ink shadow-pop"
                  style={{ left: `${Math.min(94, Math.max(12, (hoveredX / width) * 100))}%` }}
                >
                  <div className="mb-1 font-semibold text-muted">{formatPeriod(hoveredPoint.period)}</div>
                  {hoveredGroups.length === 0 ? (
                    <div className="text-muted">Hidden by legend filters</div>
                  ) : (
                    hoveredGroups.map((group) => (
                      <div className="flex items-center justify-between gap-3" key={group.key}>
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <ProviderLogo agent={group.key} size={14} color={colorFor(group.key)} />
                          {group.label}
                        </span>
                        <strong className="tabular-nums">
                          {metric === "cost" ? formatCurrency(group.value) : formatTokens(group.value)}
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            {average > 0 && (
              <div className="relative shrink-0 self-stretch max-[760px]:hidden">
                {/* An invisible copy sizes the gutter to the label, so no width is hard-coded. */}
                <div className="invisible" aria-hidden="true">
                  {averageBadge}
                </div>
                <div
                  className="pointer-events-none absolute right-0 -translate-y-1/2"
                  style={{ top: `${(averageY / height) * 100}%` }}
                >
                  {averageBadge}
                </div>
              </div>
            )}
          </div>
          <fieldset
            className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4 text-[10px] text-muted"
            aria-label="Chart legend"
          >
            {groupKeys.map((key) => {
              const label =
                points.flatMap((point) => point.groups).find((group) => group.key === key)?.label ||
                providerName(key);
              const totalCost = points.reduce(
                (sum, point) => sum + (point.groups.find((group) => group.key === key)?.cost || 0),
                0,
              );
              const totalTokens = points.reduce(
                (sum, point) => sum + (point.groups.find((group) => group.key === key)?.tokens || 0),
                0,
              );
              const hidden = hiddenGroups.has(key);
              return (
                <button
                  className={`inline-flex items-center gap-2 rounded-full border border-hairline px-2.5 py-1 transition hover:border-subtle ${hidden ? "bg-transparent opacity-40" : "bg-card"}`}
                  key={key}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={(event) => toggleGroup(key, event.shiftKey)}
                >
                  <ProviderLogo agent={key} size={14} color={colorFor(key)} />
                  <span className="font-medium text-ink">{label}</span>
                  <span className="tabular-nums text-muted">
                    {formatCurrency(totalCost)} · {formatTokens(totalTokens)} tokens
                  </span>
                </button>
              );
            })}
          </fieldset>
        </>
      )}
    </div>
  );
}
