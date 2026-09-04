import type { ContributionDay } from "@shared/analytics/contribution";
import { createPortal } from "react-dom";

export interface TooltipState {
  day: ContributionDay;
  left: number;
  top: number;
  placement: "above" | "below";
}

const tooltipWidth = 236;
const tooltipMargin = 14;

export function tooltipPosition(element: HTMLElement): Pick<TooltipState, "left" | "top" | "placement"> {
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

export function tooltipId(day: ContributionDay): string {
  return `contribution-tooltip-${day.key}`;
}

export default function ContributionTooltip({ tooltip }: { tooltip: TooltipState }) {
  return createPortal(
    <div
      className={`pointer-events-none fixed z-[100] w-[min(236px,calc(100vw-28px))] rounded-control border border-hairline bg-card px-3.5 py-2.5 text-left text-[10px] leading-relaxed text-ink shadow-pop ${
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
