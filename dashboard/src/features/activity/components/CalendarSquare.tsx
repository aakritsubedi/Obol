import type { ContributionDay } from "@shared/analytics/contribution";
import { contributionRamp } from "@shared/ui/ramp";
import { tooltipId } from "./ContributionTooltip";

export default function CalendarSquare({
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
      className={`contribution-square rounded-[4px] border-0 p-0 transition-[opacity,transform,box-shadow] duration-150 hover:scale-[1.12] hover:shadow-[0_0_0_2px_var(--color-surface)] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${visible ? "relative z-10 scale-[1.12] shadow-[0_0_0_2px_var(--color-surface)]" : ""}`}
      onBlur={onLeave}
      onFocus={(event) => onHover(day, event.currentTarget)}
      onMouseEnter={(event) => onHover(day, event.currentTarget)}
      onMouseLeave={onLeave}
      style={{
        backgroundColor: contributionRamp[day.level],
        opacity: dimmed ? 0.35 : 1,
      }}
      tabIndex={dimmed ? -1 : 0}
      type="button"
    />
  );
}
