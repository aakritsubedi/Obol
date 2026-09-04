import { CHEVRON_DOWN, Icon } from "@shared/ui/icons";
import type { SortDirection, SortKey } from "../model/sort";

export default function SortButton({
  label,
  sortKey,
  active,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] transition ${active ? "text-ink" : "text-muted hover:text-ink"}`}
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon
        path={CHEVRON_DOWN}
        className={`h-2.5 w-2.5 shrink-0 transition ${active ? (direction === "asc" ? "rotate-180 opacity-100" : "opacity-100") : "opacity-0"}`}
      />
    </button>
  );
}
