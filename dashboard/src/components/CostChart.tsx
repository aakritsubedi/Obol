import { useEffect, useMemo, useState } from "react";
import type { ProjectUsageRow, UsageRow } from "../api";
import { ProviderLogo, projectColor, providerColor, providerName } from "../providers";
import { formatCurrency, formatPeriod, formatTokens, numberValue, projectName } from "./format";
import { emptyState } from "./ui";

interface Props {
  rows: UsageRow[];
  metric: "cost" | "tokens";
  groupBy?: "agent" | "project";
}

interface ChartGroup {
  key: string;
  label: string;
  value: number;
  cost: number;
  tokens: number;
}

interface ChartPoint {
  period: string;
  groups: ChartGroup[];
}

function niceScale(maxValue: number): { max: number; step: number } {
  const roughStep = Math.max(maxValue / 4, 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  return { step, max: Math.ceil(maxValue / step) * step || step };
}

function labelIndexes(count: number): Set<number> {
  if (count <= 1) return new Set([0]);
  const step = Math.max(1, Math.ceil((count - 1) / 6));
  return new Set([...Array(count).keys()].filter((index) => index % step === 0 || index === count - 1));
}

function groupValue(row: UsageRow, metric: Props["metric"]): number {
  return numberValue(metric === "cost" ? row.totalCost : row.totalTokens);
}

function chartPoints(rows: UsageRow[], metric: Props["metric"], groupBy: Props["groupBy"]): ChartPoint[] {
  if (groupBy === "project") {
    const points = new Map<string, Map<string, ChartGroup>>();
    const totals = new Map<string, number>();
    for (const row of rows) {
      const project = projectName(
        String((row as ProjectUsageRow).project || row.metadata?.project || "Unknown project"),
      );
      const groups = points.get(row.period) || new Map<string, ChartGroup>();
      const current = groups.get(project) || {
        key: project,
        label: projectName(project),
        value: 0,
        cost: 0,
        tokens: 0,
      };
      current.value += groupValue(row, metric);
      current.cost += numberValue(row.totalCost);
      current.tokens += numberValue(row.totalTokens);
      groups.set(project, current);
      totals.set(project, (totals.get(project) || 0) + groupValue(row, metric));
      points.set(row.period, groups);
    }
    const topProjects = [...totals.entries()]
      .sort(([, left], [, right]) => right - left)
      .slice(0, 6)
      .map(([project]) => project);
    return [...points.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, groups]) => ({
        period,
        groups: [...groups.values()]
          .filter((group) => topProjects.includes(group.key))
          .concat({
            key: "__other__",
            label: "Other",
            value: [...groups.values()]
              .filter((group) => !topProjects.includes(group.key))
              .reduce((sum, group) => sum + group.value, 0),
            cost: [...groups.values()]
              .filter((group) => !topProjects.includes(group.key))
              .reduce((sum, group) => sum + group.cost, 0),
            tokens: [...groups.values()]
              .filter((group) => !topProjects.includes(group.key))
              .reduce((sum, group) => sum + group.tokens, 0),
          })
          .filter((group) => group.value > 0)
          .sort((left, right) => right.value - left.value),
      }));
  }

  return rows.map((row) => ({
    period: row.period,
    groups: row.agents
      .map((agent) => ({
        key: agent.agent,
        label: providerName(agent.agent),
        value: numberValue(metric === "cost" ? agent.totalCost : agent.totalTokens),
        cost: numberValue(agent.totalCost),
        tokens: numberValue(agent.totalTokens),
      }))
      .sort((left, right) => right.value - left.value),
  }));
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
    setHiddenGroups(new Set());
    setHoveredIndex(null);
  }, [groupKeys.join("\u0000")]);

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
          <div className="relative">
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
                    key={`weekend-${point.period}-${index}`}
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
                  <g key={`${point.period}-${index}`}>
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
                <>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={top + chartHeight - (average / scale.max) * chartHeight}
                    y2={top + chartHeight - (average / scale.max) * chartHeight}
                    className="stroke-muted"
                    strokeDasharray="5 4"
                    strokeWidth="1"
                  />
                  <text
                    x={width - right}
                    y={top + chartHeight - (average / scale.max) * chartHeight - 5}
                    textAnchor="end"
                    className="fill-muted text-[10px]"
                  >
                    avg {metric === "cost" ? formatCurrency(average) : formatTokens(average)}
                  </text>
                </>
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
          <div
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
          </div>
        </>
      )}
    </div>
  );
}
