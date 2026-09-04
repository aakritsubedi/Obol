import { ThemeToggle } from "@features/settings";
import type { Summary } from "@shared/api";
import type { MoneyDisplay } from "@shared/lib/format";
import { formatRelativeTime } from "@shared/lib/format";
import { USD } from "@shared/lib/money";
import { CLOCK, Icon, REFRESH, SHARE, SLIDERS } from "@shared/ui/icons";
import { buttonIcon, buttonPrimary } from "@shared/ui/tokens";
import type { ReactNode, RefObject } from "react";

function StatusPill({ stale }: { stale: boolean }) {
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium max-[520px]:hidden ${stale ? "bg-warn-soft text-warn-strong" : "bg-wash text-subtle"}`}
      title={stale ? "Showing the last cached snapshot" : "Reading live usage from the daemon"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-warn" : "bg-subtle"}`} />
      {stale ? "Cached" : "Live"}
    </span>
  );
}

interface AppShellProps {
  summary: Summary;
  money: MoneyDisplay;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenShare: () => void;
  headerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function AppHeader({
  summary,
  refreshing,
  onRefresh,
  onOpenSettings,
  onOpenShare,
  headerRef,
}: Pick<
  AppShellProps,
  "summary" | "refreshing" | "onRefresh" | "onOpenSettings" | "onOpenShare" | "headerRef"
>) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-hairline bg-surface/85 backdrop-blur-xl"
      ref={headerRef}
    >
      <div className="mx-auto flex max-w-[1180px] flex-col gap-2.5 px-8 py-3 max-[760px]:px-[18px]">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex items-center gap-2">
              <img src="/favicon-32.png" alt="" className="h-[18px] w-[18px] shrink-0 rounded-[5px]" />
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-[-0.01em]">Obol</span>
            </span>
            <span className="h-4 w-px bg-hairline max-[760px]:hidden" />
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted max-[760px]:hidden">
              <Icon path={CLOCK} className="h-3 w-3 shrink-0" />
              Local data · {summary.agents.length} active today
            </span>
          </div>
          <div className="flex items-center gap-2 max-[440px]:gap-1.5">
            <StatusPill stale={summary.stale} />
            <ThemeToggle />
            <button
              className={buttonIcon}
              type="button"
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Open settings"
            >
              <Icon path={SLIDERS} />
            </button>
            <button
              className={buttonIcon}
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title={refreshing ? "Refreshing…" : "Refresh usage"}
              aria-label="Refresh usage"
            >
              <Icon path={REFRESH} className={`h-3.5 w-3.5 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button className={buttonPrimary} type="button" onClick={onOpenShare} aria-label="Share usage">
              <Icon path={SHARE} className="h-3.5 w-3.5 shrink-0" />
              <span className="max-[520px]:hidden">Share</span>
            </button>
          </div>
        </div>
        <nav
          className="-mx-1 flex w-full items-center gap-0.5 overflow-x-auto"
          aria-label="Dashboard sections"
        >
          {[
            ["Week", "#week-leaders"],
            ["Activity", "#activity"],
            ["History", "#history"],
            ["Providers", "#providers"],
            ["Models", "#models"],
            ["Projects", "#projects"],
          ].map(([label, href]) => (
            <a
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-muted transition hover:bg-wash hover:text-ink"
              href={href}
              key={href}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function AppFooter({ summary, money }: Pick<AppShellProps, "summary" | "money">) {
  return (
    <footer className="border-t border-hairline pt-6 text-center text-[10px] leading-relaxed text-muted">
      Costs are estimates from a pricing table, not invoices. <span className="px-1.5">•</span> Data stays on
      this Mac.
      {money.code !== USD.code && (
        <>
          {" "}
          <span className="px-1.5">•</span> Shown in {money.code} at 1 {USD.code} = {money.rate.toFixed(2)}
        </>
      )}{" "}
      <span className="px-1.5">•</span> Last refresh {formatRelativeTime(summary.updatedAt)}
    </footer>
  );
}

export default function AppShell({
  summary,
  money,
  loading,
  refreshing,
  onRefresh,
  onOpenSettings,
  onOpenShare,
  headerRef,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <AppHeader
        summary={summary}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onOpenSettings={onOpenSettings}
        onOpenShare={onOpenShare}
        headerRef={headerRef}
      />
      <main
        className="mx-auto max-w-[1180px] px-8 pb-24 pt-10 max-[760px]:px-[18px] max-[760px]:pt-7"
        aria-busy={loading}
      >
        {children}
        <AppFooter summary={summary} money={money} />
      </main>
    </div>
  );
}
