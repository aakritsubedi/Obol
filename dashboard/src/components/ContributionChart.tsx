import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { UsageRow } from "../api";
import { buildContributionCalendar, type ContributionDay, type ContributionWeek } from "./contribution";
import { formatCurrency, formatTokens, moneyDisplay } from "./format";

interface Props {
  rows: UsageRow[];
}

const cellGap = 5;
const chartMinWidth = 840;
const tooltipWidth = 236;
const tooltipMargin = 14;
const levelColors: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "var(--color-track)",
  1: "var(--contribution-level-1)",
  2: "var(--contribution-level-2)",
  3: "var(--contribution-level-3)",
  4: "var(--contribution-level-4)",
};

interface TooltipState {
  day: ContributionDay;
  left: number;
  top: number;
  placement: "above" | "below";
}

function tooltipPosition(element: HTMLElement): Pick<TooltipState, "left" | "top" | "placement"> {
  const rect = element.getBoundingClientRect();
  const halfWidth = tooltipWidth / 2;
  const left = Math.min(
    window.innerWidth - tooltipMargin - halfWidth,
    Math.max(tooltipMargin + halfWidth, rect.left + rect.width / 2),
  );
  const placement = rect.top >= 86 ? "above" : "below";

  return {
    left,
    placement,
    top: placement === "above" ? Math.max(tooltipMargin, rect.top - 10) : rect.bottom + 10,
  };
}

function tooltipId(day: ContributionDay): string {
  return `contribution-tooltip-${day.key}`;
}

function CalendarSquare({
  day,
  visible,
  onHover,
  onLeave,
}: {
  day: ContributionDay;
  visible: boolean;
  onHover: (day: ContributionDay, element: HTMLElement) => void;
  onLeave: () => void;
}) {
  const dimmed = day.state === "before-data" || day.state === "future";

  return (
    <button
      aria-disabled={dimmed || undefined}
      aria-label={day.label}
      aria-describedby={visible ? tooltipId(day) : undefined}
      className={`contribution-square rounded-[4px] border-0 p-0 transition-[opacity,transform,box-shadow] duration-150 hover:scale-[1.12] hover:shadow-[0_0_0_2px_var(--color-surface),0_4px_12px_rgba(0,0,0,.24)] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${visible ? "relative z-10 scale-[1.12] shadow-[0_0_0_2px_var(--color-surface),0_4px_12px_rgba(0,0,0,.24)]" : ""}`}
      onBlur={onLeave}
      onFocus={(event) => onHover(day, event.currentTarget)}
      onMouseEnter={(event) => onHover(day, event.currentTarget)}
      onMouseLeave={onLeave}
      style={{
        backgroundColor: levelColors[day.level],
        opacity: dimmed ? 0.35 : 1,
      }}
      tabIndex={dimmed ? -1 : 0}
      type="button"
    />
  );
}

function ContributionTooltip({ tooltip }: { tooltip: TooltipState }) {
  return createPortal(
    <div
      className={`pointer-events-none fixed z-[100] w-[min(236px,calc(100vw-28px))] rounded-xl border border-hairline bg-card px-3.5 py-2.5 text-left text-[10px] leading-relaxed text-ink shadow-[0_16px_40px_rgba(0,0,0,.28)] ${
        tooltip.placement === "above" ? "-translate-x-1/2 -translate-y-full" : "-translate-x-1/2"
      }`}
      id={tooltipId(tooltip.day)}
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      <span className="block font-semibold text-muted">{tooltip.day.tooltip[0]}</span>
      {tooltip.day.tooltip.slice(1).map((line) => (
        <span className="mt-0.5 block tabular-nums" key={line}>
          {line}
        </span>
      ))}
    </div>,
    document.body,
  );
}

export default function ContributionChart({ rows }: Props) {
  const todayKey = new Date().toDateString();
  // The calendar bakes each day's tooltip text, currency included, so a change
  // of display currency has to rebuild it — unlike the totals below, which stay
  // numbers until they are rendered.
  const money = moneyDisplay();
  const calendar = useMemo(() => buildContributionCalendar(rows, new Date()), [rows, todayKey, money]);
  const plotRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const updateWidth = () => setPlotWidth(plot.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setHoveredKey(null);
    setTooltip(null);
  }, [calendar.days]);

  useEffect(() => {
    if (!tooltip) return;
    const updatePosition = () => {
      if (!anchorRef.current) return;
      setTooltip((current) =>
        current ? { ...current, ...tooltipPosition(anchorRef.current as HTMLElement) } : null,
      );
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [tooltip]);

  const cellSize = useMemo(() => {
    const available = Math.max(0, plotWidth - cellGap * (calendar.weeks.length - 1));
    return available > 0 ? available / calendar.weeks.length : 12;
  }, [calendar.weeks.length, plotWidth]);

  const showTooltip = (day: ContributionDay, element: HTMLElement) => {
    anchorRef.current = element;
    setHoveredKey(day.key);
    setTooltip({ day, ...tooltipPosition(element) });
  };

  const hideTooltip = () => {
    anchorRef.current = null;
    setHoveredKey(null);
    setTooltip(null);
  };

  const yearTotals = useMemo(
    () =>
      calendar.days.reduce(
        (totals, day) => {
          if (day.state !== "before-data" && day.state !== "future") {
            totals.tokens += day.tokens;
            totals.cost += day.cost;
          }
          return totals;
        },
        { tokens: 0, cost: 0 },
      ),
    [calendar.days],
  );

  const renderWeek = (week: ContributionWeek) => (
    <div
      className="grid min-w-0"
      key={week.key}
      style={{ gap: cellGap, gridTemplateRows: `repeat(7, ${cellSize}px)` }}
    >
      {week.days.map((day, dayIndex) =>
        day ? (
          <CalendarSquare
            day={day}
            key={day.key}
            onHover={showTooltip}
            onLeave={hideTooltip}
            visible={hoveredKey === day.key}
          />
        ) : (
          <div aria-hidden="true" key={`${week.key}-empty-${dayIndex}`} />
        ),
      )}
    </div>
  );

  return (
    <section
      aria-labelledby="activity-heading"
      className="relative border-t border-dashed py-12"
      id="activity"
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div
            className="text-[10px] font-semibold uppercase leading-tight tracking-[0.16em] text-muted"
            id="activity-heading"
          >
            Activity
          </div>
          <h2 className="mt-2 text-[22px] font-bold tracking-[-0.04em]">{calendar.year} token burn</h2>
          <p className="mt-1.5 text-[11px] text-muted">
            Daily usage <span className="px-1 text-subtle">·</span> {formatTokens(yearTotals.tokens)} tokens
            <span className="px-1 text-subtle">·</span> {formatCurrency(yearTotals.cost)} this year
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted max-[520px]:w-full max-[520px]:justify-between">
          <span>Less</span>
          <div className="flex items-center gap-1.5" aria-label="Activity intensity legend">
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                className="h-3 w-3 rounded-[4px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]"
                key={level}
                style={{ backgroundColor: levelColors[level as 0 | 1 | 2 | 3 | 4] }}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>

      <div className="contribution-chart-scroll">
        <div className="contribution-chart" style={{ minWidth: chartMinWidth }}>
          <div
            aria-hidden="true"
            className="contribution-day-labels"
            style={{ gap: cellGap, gridTemplateRows: `repeat(7, ${cellSize}px)` }}
          >
            {["", "Mon", "", "Wed", "", "Fri", ""].map((label, index) => (
              <span className="self-center pr-3" key={`${label}-${index}`}>
                {label}
              </span>
            ))}
          </div>
          <div className="contribution-plot" ref={plotRef}>
            <div aria-hidden="true" className="contribution-months">
              {calendar.monthLabels.map((month) => (
                <span
                  className="absolute top-0"
                  key={month.key}
                  style={{ left: month.weekIndex * (cellSize + cellGap) }}
                >
                  {month.label}
                </span>
              ))}
            </div>
            <div
              className="grid w-full"
              role="group"
              aria-label="Daily token usage calendar"
              style={{
                gap: cellGap,
                gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 1fr))`,
              }}
            >
              {calendar.weeks.map(renderWeek)}
            </div>
          </div>
        </div>
      </div>
      {tooltip && <ContributionTooltip tooltip={tooltip} />}
    </section>
  );
}
