import {
  buildContributionCalendar,
  type ContributionDay,
  type ContributionWeek,
} from "@shared/analytics/contribution";
import type { UsageRow } from "@shared/api";
import { formatCurrency, formatTokens, moneyDisplay } from "@shared/lib/format";
import { contributionRamp } from "@shared/ui/ramp";
import SectionHeader from "@shared/ui/SectionHeader";
import { sectionShell } from "@shared/ui/tokens";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CalendarSquare from "./CalendarSquare";
import ContributionTooltip, { type TooltipState, tooltipPosition } from "./ContributionTooltip";

interface Props {
  rows: UsageRow[];
}

const cellGap = 5;
const chartMinWidth = 840;
const dayLabels = [
  { key: "sunday", label: "" },
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "" },
];
export default function ContributionChart({ rows }: Props) {
  const todayKey = new Date().toDateString();
  // The calendar bakes each day's tooltip text, currency included, so a change
  // of display currency has to rebuild it — unlike the totals below, which stay
  // numbers until they are rendered.
  const money = moneyDisplay();
  const calendar = useMemo(
    () => buildContributionCalendar(rows, new Date(todayKey), undefined, money),
    [rows, todayKey, money],
  );
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
    if (calendar.days.length === 0) {
      setHoveredKey(null);
      setTooltip(null);
      return;
    }
    setHoveredKey(null);
    setTooltip(null);
  }, [calendar]);

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
          /* biome-ignore lint/suspicious/noArrayIndexKey: Empty calendar cells are fixed positional placeholders. */
          <div aria-hidden="true" key={`${week.key}-empty-${dayIndex}`} />
        ),
      )}
    </div>
  );

  return (
    <section aria-labelledby="activity-heading" className={`relative ${sectionShell}`} id="activity">
      <SectionHeader
        eyebrow="Activity"
        id="activity-heading"
        title={`${calendar.year} token burn`}
        description={
          <>
            Daily usage <span className="px-1">·</span> {formatTokens(yearTotals.tokens)} tokens
            <span className="px-1">·</span> {formatCurrency(yearTotals.cost)} this year
          </>
        }
        actions={
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span>Less</span>
            <div className="flex items-center gap-1" role="img" aria-label="Activity intensity legend">
              {[0, 1, 2, 3, 4].map((level) => (
                <span
                  className="h-[11px] w-[11px] rounded-[3px] ring-1 ring-inset ring-hairline"
                  key={level}
                  style={{ backgroundColor: contributionRamp[level as 0 | 1 | 2 | 3 | 4] }}
                />
              ))}
            </div>
            <span>More</span>
          </div>
        }
      />

      <div className="contribution-chart-scroll">
        <div className="contribution-chart" style={{ minWidth: chartMinWidth }}>
          <div
            aria-hidden="true"
            className="contribution-day-labels"
            style={{ gap: cellGap, gridTemplateRows: `repeat(7, ${cellSize}px)` }}
          >
            {dayLabels.map((dayLabel) => (
              <span className="self-center pr-3" key={dayLabel.key}>
                {dayLabel.label}
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
            <fieldset
              className="m-0 grid w-full min-w-0 border-0 p-0"
              aria-label="Daily token usage calendar"
              style={{
                gap: cellGap,
                gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 1fr))`,
              }}
            >
              {calendar.weeks.map(renderWeek)}
            </fieldset>
          </div>
        </div>
      </div>
      {tooltip && <ContributionTooltip tooltip={tooltip} />}
    </section>
  );
}
