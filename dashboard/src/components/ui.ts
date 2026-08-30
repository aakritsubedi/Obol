// Shared class strings for the handful of control shapes the dashboard uses.
// Buttons had drifted into five near-identical variants; naming them here keeps
// height, radius, and focus treatment identical everywhere.

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const buttonBase = `inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-medium transition disabled:cursor-default disabled:opacity-50 ${focusRing}`;

/** Default action: hairline outline on the page background. */
export const buttonGhost = `${buttonBase} border border-hairline bg-card text-subtle hover:border-subtle hover:text-ink`;

/** Single high-emphasis action per surface. */
export const buttonPrimary = `${buttonBase} border border-ink bg-ink text-surface hover:opacity-90`;

/** Square icon-only variant of `buttonGhost`. */
export const buttonIcon = `grid h-8 w-8 shrink-0 place-items-center rounded-full border border-hairline bg-card text-muted transition hover:border-subtle hover:text-ink ${focusRing}`;

export const inputControl = `w-full rounded-control border border-hairline bg-card px-3 py-2 text-[11px] text-ink outline-none transition placeholder:text-muted focus:border-subtle focus:ring-4 focus:ring-wash`;

/** Elevated content block: bordered, barely shadowed, 16px radius. */
export const cardSurface = "rounded-card border border-hairline bg-card shadow-card";

/** Vertical rhythm shared by every top-level section on the page. */
export const sectionShell = "border-t border-hairline py-10 max-[760px]:py-8";

/** Placeholder shown where a table or chart has nothing to draw. */
export const emptyState = "grid min-h-[120px] place-items-center px-4 text-center text-[11px] text-muted";

/** Column heading inside a data table. */
export const tableHead = "pb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted";
