import type { ReactNode } from "react";

interface Props {
  /** Small uppercase kicker; also the accessible name when `id` is wired to aria-labelledby. */
  eyebrow: string;
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Controls that belong to the section - filters, search, export. */
  actions?: ReactNode;
  className?: string;
}

// Nine sections used to hand-roll this same eyebrow/title/description stack with
// slightly different sizes and margins each time. Routing them all through one
// component is what makes the page scan as a single grid.
export default function SectionHeader({ eyebrow, id, title, description, actions, className }: Props) {
  return (
    <div
      className={`mb-6 flex items-start justify-between gap-4 max-[760px]:flex-col max-[760px]:items-stretch ${className || ""}`}
    >
      <div className="min-w-0">
        <div
          className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted"
          id={id}
        >
          {eyebrow}
        </div>
        <h2 className="mt-2 flex flex-wrap items-center gap-2 text-base font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-2 max-[760px]:justify-start">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Neutral inline chip used to qualify a heading ("Claude only", "Day 3 of 7"). */
export function HeaderBadge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="rounded-full bg-wash px-2 py-0.5 text-[10px] font-semibold text-subtle" title={title}>
      {children}
    </span>
  );
}
