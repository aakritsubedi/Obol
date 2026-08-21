import { useEffect, useMemo, useState } from "react";
import type { ProjectUsageRow, UsageRow } from "../api";
import { displayName, formatCurrency, formatPeriod, formatTokens, numberValue, projectName } from "./format";

interface Props {
  rows: UsageRow[];
  metric: "cost" | "tokens";
  groupBy?: "agent" | "project";
}

interface ChartGroup {
  key: string;
  label: string;
  value: number;
}

interface ChartPoint {
  period: string;
  groups: ChartGroup[];
}

const knownProviderColors: Record<string, string> = {
  claude: "#BF4724",
  codex: "#1C855E",
  gemini: "#2F6FD0",
  cursor: "#6B4FA8",
  copilot: "#8A6D3B",
  openai: "#8B8F98",
};

const fallbackProviderColors = ["#2F6FD0", "#6B4FA8", "#8A6D3B", "#8B8F98"];

export function providerColor(agent: string): string {
  const normalized = agent.trim().toLowerCase();
  if (knownProviderColors[normalized]) return knownProviderColors[normalized];
  let hash = 0;
  for (const character of normalized) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return fallbackProviderColors[hash % fallbackProviderColors.length];
}

function groupValue(row: UsageRow, metric: Props["metric"]): number {
  return numberValue(metric === "cost" ? row.totalCost : row.totalTokens);
}

function chartPoints(rows: UsageRow[], metric: Props["metric"], groupBy: Props["groupBy"]): ChartPoint[] {
  if (groupBy === "project") {
    const points = new Map<string, Map<string, ChartGroup>>();
    for (const row of rows) {
      const project = projectName(
        String((row as ProjectUsageRow).project || row.metadata?.project || "Unknown project"),
      );
      const groups = points.get(row.period) || new Map<string, ChartGroup>();
      const current = groups.get(project) || { key: project, label: projectName(project), value: 0 };
      current.value += groupValue(row, metric);
      groups.set(project, current);
      points.set(row.period, groups);
    }
    return [...points.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, groups]) => ({
        period,
        groups: [...groups.values()].sort((left, right) => right.value - left.value),
      }));
  }

  return rows.map((row) => ({
    period: row.period,
    groups: row.agents
      .map((agent) => ({
        key: agent.agent,
        label: displayName(agent.agent),
        value: numberValue(metric === "cost" ? agent.totalCost : agent.totalTokens),
      }))
      .sort((left, right) => right.value - left.value),
  }));
}

export default function CostChart({ rows, metric, groupBy = "agent" }: Props) {
  const points = useMemo(() => chartPoints(rows, metric, groupBy), [groupBy, metric, rows]);
  const groupKeys = useMemo(
    () => [...new Set(points.flatMap((point) => point.groups.map((group) => group.key)))],
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
  const max = Math.max(
    1,
    ...visiblePoints.map((point) => point.groups.reduce((sum, group) => sum + group.value, 0)),
  );
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
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];
  const hoveredGroups = hoveredPoint?.groups.filter((group) => !hiddenGroups.has(group.key)) || [];
  const hoveredX = hoveredIndex === null ? 0 : left + (hoveredIndex + 0.5) * slotWidth;

  function toggleGroup(key: string) {
    setHiddenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="min-h-[280px]">
      {points.length === 0 ? (
        <div className="grid min-h-[130px] place-items-center text-center text-xs text-muted">
          No history available yet.
        </div>
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
              {[0, 0.5, 1].map((ratio) => {
                const y = top + chartHeight * (1 - ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={y}
                      y2={y}
                      className="stroke-hairline"
                      strokeWidth="1"
                    />
                    <text x={left - 8} y={y + 4} textAnchor="end" className="fill-muted text-[10px]">
                      {metric === "cost" ? formatCurrency(max * ratio) : formatTokens(max * ratio)}
                    </text>
                  </g>
                );
              })}
              {visiblePoints.map((point, index) => {
                const x = left + (index + 0.5) * slotWidth - barWidth / 2;
                let accumulated = 0;
                return (
                  <g key={`${point.period}-${index}`}>
                    {point.groups.map((group) => {
                      const h = (group.value / max) * chartHeight;
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
                          fill={providerColor(group.key)}
                        />
                      );
                    })}
                    {(index === 0 ||
                      index === points.length - 1 ||
                      index === Math.floor(points.length / 2)) && (
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
                className="pointer-events-none absolute top-2 z-10 w-[190px] -translate-x-1/2 rounded-[10px] border border-hairline bg-card px-3 py-2 text-[10px] text-ink shadow-[0_10px_28px_rgba(0,0,0,.14)]"
                style={{ left: `${Math.min(94, Math.max(12, (hoveredX / width) * 100))}%` }}
              >
                <div className="mb-1 font-semibold text-muted">{formatPeriod(hoveredPoint.period)}</div>
                {hoveredGroups.length === 0 ? (
                  <div className="text-muted">Hidden by legend filters</div>
                ) : (
                  hoveredGroups.map((group) => (
                    <div className="flex items-center justify-between gap-3" key={group.key}>
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <i
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: providerColor(group.key) }}
                        />
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
            className="flex flex-wrap items-center gap-1.5 pl-12 pt-1 text-[10px] text-muted"
            aria-label="Chart legend"
          >
            {groupKeys.map((key) => {
              const label =
                points.flatMap((point) => point.groups).find((group) => group.key === key)?.label ||
                displayName(key);
              const hidden = hiddenGroups.has(key);
              return (
                <button
                  className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-1 transition ${hidden ? "bg-transparent opacity-45" : "bg-wash"}`}
                  key={key}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => toggleGroup(key)}
                >
                  <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: providerColor(key) }} />
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
