import type { DayJournal } from "../api";
import { formatDuration } from "./format";
import { dayShape, formatClock, formatHourLabel } from "./journal";

interface Props {
  /** Always today's journal, never the day the task picker is parked on. */
  journal: DayJournal | null;
  /** One-line variant for the condensed sticky heading: bars and total only. */
  compact?: boolean;
}

const levelColors: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "var(--contribution-level-0)",
  1: "var(--contribution-level-1)",
  2: "var(--contribution-level-2)",
  3: "var(--contribution-level-3)",
  4: "var(--contribution-level-4)",
};

// Only a few ticks, or 24 labels crush a strip this size.
const TICKS = [0, 6, 12, 18];

/**
 * Today at a glance, beside the page title: when the first session opened, how
 * hard each hour since then ran, and how much of the day was active.
 *
 * It shares the calendar's color ramp on purpose — one ramp, one meaning of
 * "darker", whether the cell is an hour or a day.
 */
export default function DayStrip({ journal, compact = false }: Props) {
  const shape = dayShape(journal);
  if (!journal || shape.activeMinutes <= 0) return null;

  // Condensed, the strip keeps only what survives at a glance: the ramp and
  // the day's total. The hour ticks and the started/busiest line are reading
  // material, and the sticky bar is not where anyone stops to read.
  if (compact) {
    return (
      <section aria-label="Today’s shape" className="flex shrink-0 items-center gap-2.5 max-[640px]:hidden">
        <div aria-label={summaryLabel(shape)} className="flex items-end gap-[2px]" role="img">
          {shape.hours.map((entry) => (
            <span
              className="h-[14px] w-[4px] rounded-[1px]"
              key={entry.hour}
              style={{ backgroundColor: levelColors[entry.level] }}
              title={hourTitle(entry)}
            />
          ))}
        </div>
        <span className="whitespace-nowrap text-[10px] tabular-nums text-muted">
          {formatDuration(shape.activeMinutes)} active
        </span>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="day-strip-heading"
      className="shrink-0 max-[640px]:hidden"
      // The strip reads left to right as a clock, so it stays left-aligned
      // inside a block that is itself pushed to the right of the title.
    >
      <div className="flex items-baseline justify-between gap-4">
        <span
          className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted"
          id="day-strip-heading"
        >
          Today’s shape
        </span>
        <span className="whitespace-nowrap text-[10px] tabular-nums text-muted">
          {formatDuration(shape.activeMinutes)} active
        </span>
      </div>
      <div className="mt-2 flex items-end gap-[3px]" role="img" aria-label={summaryLabel(shape)}>
        {shape.hours.map((entry) => (
          <span
            className="h-[18px] w-[7px] rounded-[2px]"
            key={entry.hour}
            style={{ backgroundColor: levelColors[entry.level] }}
            title={hourTitle(entry)}
          />
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-[3px] text-[9px] leading-none text-muted">
        {shape.hours.map((entry) => (
          <span className="w-[7px] text-center" key={entry.hour}>
            {TICKS.includes(entry.hour) ? formatHourLabel(entry.hour).replace(/\s*(AM|PM)/i, "") : ""}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[10px] tabular-nums text-muted">
        Started {formatClock(shape.startedAt)}
        {shape.peakHour !== null && <> · busiest {formatHourLabel(shape.peakHour)}</>}
      </p>
    </section>
  );
}

function hourTitle(entry: ReturnType<typeof dayShape>["hours"][number]): string {
  const state = entry.minutes >= 1 ? `${Math.round(entry.minutes)}m active` : "idle";
  return `${formatHourLabel(entry.hour)} · ${state}`;
}

function summaryLabel(shape: ReturnType<typeof dayShape>): string {
  const started = formatClock(shape.startedAt);
  const busiest = shape.peakHour === null ? "" : `, busiest around ${formatHourLabel(shape.peakHour)}`;
  return `Work started at ${started}, ${formatDuration(shape.activeMinutes)} active today${busiest}`;
}
