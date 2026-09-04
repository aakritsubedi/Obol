import { ContributionChart } from "@features/activity";
import { ModelTable, ProjectTable, ProviderTable } from "@features/breakdown";
import { CostChart, useHistoryControls } from "@features/history";
import { JournalCard, useJournal } from "@features/journal";
import { DayStrip, Ticker, TodayCard, TotalsCard } from "@features/overview";
import { trailingDailyTrend, weekSummaryFor } from "@features/overview/model/trend";
import { SettingsDialog } from "@features/settings";
import { ShareDialog } from "@features/share";
import { WeeklyLeaders } from "@features/weekly";
import { rangeRows } from "@shared/analytics/ranges";
import { useStickyHeading } from "@shared/hooks/useStickyHeading";
import { download } from "@shared/lib/download";
import { exportCsv, exportJson } from "@shared/lib/export";
import { formatCurrency, formatUpdatedAt } from "@shared/lib/format";
import ErrorBoundary from "@shared/ui/ErrorBoundary";
import { CHEVRON_DOWN, CLOCK, DOWNLOAD, Icon } from "@shared/ui/icons";
import SectionHeader, { HeaderBadge } from "@shared/ui/SectionHeader";
import Segmented from "@shared/ui/Segmented";
import { buttonGhost, emptyState, sectionShell } from "@shared/ui/tokens";
import { useMemo, useState } from "react";
import AppShell from "./AppShell";
import { useCurrency } from "./providers/CurrencyProvider";
import { useUsageData } from "./providers/UsageDataProvider";

function DashboardPage() {
  const { summary, report, config, loading, error, refreshing, doRefresh, setConfig } = useUsageData();
  const money = useCurrency();
  const journalState = useJournal();
  const controls = useHistoryControls(report, config);
  const { period, setPeriod, setRange, metric, setMetric, availableRanges, activeRange, rows } = controls;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { headerRef, headingRef, headingSentinelRef, headerHeight, headingStuck } = useStickyHeading();

  const projects = report?.projects || [];
  const projectTotal = projects.reduce((sum, row) => sum + row.totalCost, 0);
  const weekSummary = useMemo(
    () => weekSummaryFor(report, summary.today.period),
    [report, summary.today.period],
  );
  const dailyTrend = useMemo(
    () => trailingDailyTrend(report, summary.today.period),
    [report, summary.today.period],
  );

  async function handleRefresh() {
    await doRefresh();
    await journalState.reload();
  }

  function downloadCurrentJson() {
    download(
      `obol-${period}-${activeRange}d.json`,
      exportJson({ period, rangeDays: activeRange, metric, rows }),
      "application/json",
    );
  }

  function downloadCurrentCsv() {
    download(`obol-${period}-${activeRange}d.csv`, exportCsv(rows, metric), "text/csv;charset=utf-8");
  }

  return (
    <AppShell
      summary={summary}
      money={money}
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenShare={() => setShareOpen(true)}
      headerRef={headerRef}
    >
      <div aria-hidden="true" className="h-px" ref={headingSentinelRef} />
      <div
        className={`sticky z-30 -mx-8 mb-8 flex items-end justify-between gap-8 border-b border-transparent px-8 [overflow-anchor:none] transition-[background-color,border-color] duration-200 max-[860px]:flex-col max-[860px]:items-start max-[860px]:gap-5 max-[760px]:-mx-[18px] max-[760px]:px-[18px] ${headingStuck ? "border-hairline bg-surface/85 py-3 backdrop-blur-xl" : ""}`}
        ref={headingRef}
        style={{ top: headerHeight }}
      >
        <div className="min-w-0">
          <h1
            className={`font-semibold leading-none transition-colors duration-200 ${headingStuck ? "text-[19px] tracking-[-0.02em]" : "text-[40px] tracking-[-0.04em] max-[760px]:text-[34px] max-[440px]:text-[30px]"}`}
          >
            Token cost
          </h1>
          <p
            className={`inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors duration-200 ${headingStuck ? "mt-1" : "mt-3"}`}
          >
            <Icon path={CLOCK} className="h-3 w-3 shrink-0" />
            {summary.updatedAt
              ? `Updated ${formatUpdatedAt(summary.updatedAt)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
              : "Waiting for first refresh"}
          </p>
        </div>
        <DayStrip compact={headingStuck} journal={journalState.todayJournal} />
      </div>
      {error && (
        <div className="mb-6 rounded-control border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[11px] text-warn-strong">
          <strong className="font-semibold">Daemon notice:</strong> {error}.{" "}
          {summary.updatedAt ? "Showing the last good snapshot." : "Start the daemon to load usage."}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] gap-5 max-[760px]:grid-cols-1">
        <TodayCard summary={summary} week={weekSummary} trend={dailyTrend} />
        <TotalsCard report={report} summary={summary} config={config} />
      </div>

      <div className="pt-5">
        <Ticker summary={summary} />
      </div>
      <WeeklyLeaders report={report} />
      <ContributionChart rows={report?.daily || []} />

      <section className={sectionShell} id="history" aria-labelledby="history-heading">
        <SectionHeader
          eyebrow="History"
          id="history-heading"
          title="Spend over time"
          description={`${rows.length} ${period} periods in the current view`}
          actions={
            <>
              <Segmented
                label="History period"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly", disabled: activeRange <= 7 },
                  { value: "monthly", label: "Monthly", disabled: activeRange <= 30 },
                ]}
              />
              <Segmented
                label="History range"
                value={String(activeRange)}
                onChange={(value) => setRange(Number(value) as 7 | 30 | 90)}
                options={availableRanges.map((value) => ({ value: String(value), label: `${value}d` }))}
              />
              <Segmented
                label="Chart metric"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "cost", label: "Cost" },
                  { value: "tokens", label: "Tokens" },
                ]}
              />
              <div className="relative">
                <button
                  className={buttonGhost}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  onClick={() => setExportOpen((value) => !value)}
                >
                  <Icon path={DOWNLOAD} className="h-3.5 w-3.5 shrink-0" />
                  Export
                  <Icon path={CHEVRON_DOWN} className="h-3 w-3 shrink-0 opacity-60" />
                </button>
                {exportOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+6px)] z-10 grid w-44 gap-0.5 overflow-hidden rounded-control border border-hairline bg-card p-1.5 shadow-pop"
                    role="menu"
                  >
                    <button
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px] text-ink transition hover:bg-wash"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        downloadCurrentCsv();
                        setExportOpen(false);
                      }}
                    >
                      Download CSV
                    </button>
                    <button
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[11px] text-ink transition hover:bg-wash"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        downloadCurrentJson();
                        setExportOpen(false);
                      }}
                    >
                      Download JSON
                    </button>
                  </div>
                )}
              </div>
            </>
          }
        />
        <CostChart rows={rows} metric={metric} />
      </section>

      <div id="providers">
        <ProviderTable providers={summary.agents} total={summary.today.totalCost} />
      </div>
      <ModelTable report={report} period={period} />
      {projects.length > 0 && (
        <>
          <section className={sectionShell} id="projects" aria-labelledby="project-chart-heading">
            <SectionHeader
              eyebrow="Project history"
              id="project-chart-heading"
              title={
                <>
                  Cost by Claude project
                  <HeaderBadge>Claude only</HeaderBadge>
                </>
              }
              description={`Last ${activeRange} days · of ${formatCurrency(projectTotal)} Claude spend`}
            />
            <CostChart rows={rangeRows(projects, activeRange)} metric="cost" groupBy="project" />
          </section>
          <ProjectTable projects={projects} />
        </>
      )}
      {!config && <div className={emptyState}>Budget configuration is unavailable.</div>}

      <ErrorBoundary label="The task list">
        <JournalCard
          journal={journalState.journal}
          options={journalState.journalOptions}
          date={journalState.journalDate}
          onDateChange={journalState.setJournalDate}
          loading={journalState.journalLoading}
        />
      </ErrorBoundary>

      {settingsOpen && config && (
        <SettingsDialog config={config} onSaved={setConfig} onClose={() => setSettingsOpen(false)} />
      )}
      {shareOpen && <ShareDialog report={report} summary={summary} onClose={() => setShareOpen(false)} />}
    </AppShell>
  );
}

export default DashboardPage;
