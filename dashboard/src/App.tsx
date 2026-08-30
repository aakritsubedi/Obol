import { useEffect, useMemo, useState } from "react";
import {
  type DayJournal,
  getConfig,
  getJournal,
  getReport,
  type Report,
  refresh,
  rememberToken,
  type Summary,
  subscribe,
  type UsageRow,
  type WidgetConfig,
} from "./api";
import BudgetSettings from "./components/BudgetSettings";
import ContributionChart from "./components/ContributionChart";
import CostChart from "./components/CostChart";
import ErrorBoundary from "./components/ErrorBoundary";
import {
  formatCurrency,
  formatRelativeTime,
  formatUpdatedAt,
  type MoneyDisplay,
  setMoneyDisplay,
} from "./components/format";
import { CHEVRON_DOWN, CLOCK, CLOSE, DOWNLOAD, Icon, REFRESH, SHARE, SLIDERS } from "./components/icons";
import JournalCard from "./components/JournalCard";
import { weekOptions } from "./components/journal";
import ModelTable from "./components/ModelTable";
import ProjectTable from "./components/ProjectTable";
import ProviderTable from "./components/ProviderTable";
import SectionHeader, { HeaderBadge } from "./components/SectionHeader";
import Segmented from "./components/Segmented";
import ShareDialog from "./components/ShareDialog";
import ThemeToggle from "./components/ThemeToggle";
import Ticker from "./components/Ticker";
import TodayCard, { type Last7Summary } from "./components/TodayCard";
import TotalsCard from "./components/TotalsCard";
import { buttonGhost, buttonIcon, buttonPrimary, emptyState, sectionShell } from "./components/ui";
import WeeklyLeaders from "./components/WeeklyLeaders";
import { loadMoneyDisplay, USD } from "./currency";
import { type ExportMetric, exportCsv, exportJson } from "./export";

type HistoryPeriod = "daily" | "weekly" | "monthly";
type HistoryRange = 7 | 30 | 90;
type ChartMetric = ExportMetric;

function loadingSummary(): Summary {
  return {
    today: {
      period: "",
      totalCost: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelsUsed: [],
      modelBreakdowns: [],
    },
    agents: [],
    burnRate: { costPerHour: 0 },
    projection: { totalCost: 0 },
    budgetStatus: "ok",
    budget: { dailyRatio: null, monthlyRatio: null, reason: null },
    updatedAt: null,
    stale: true,
    error: null,
  };
}

function periodDate(period: string): number | null {
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(period)) return null;
  const value = new Date(`${period.length === 7 ? `${period}-01` : period.slice(0, 10)}T12:00:00`).valueOf();
  return Number.isFinite(value) ? value : null;
}

function rangeRows(rows: UsageRow[], range: HistoryRange): UsageRow[] {
  const cutoff = Date.now() - (range - 1) * 86_400_000;
  return rows.filter((row) => {
    const date = periodDate(row.period);
    return date === null || date >= cutoff;
  });
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// The hero card summarizes a trailing 7-day window ending today. It is
// deliberately not the calendar week: the leaders section owns Sun–Sat and
// says so, so the two windows never share one ambiguous "this week" label.
function weekSummaryFor(report: Report | null, todayPeriod: string): Last7Summary {
  const empty: Last7Summary = { totalCost: 0, totalTokens: 0, activeDays: 0, averageDaily: 0 };
  if (!report || !todayPeriod || periodDate(todayPeriod) === null) return empty;

  const todayKey = todayPeriod.slice(0, 10);
  const today = new Date(`${todayKey}T12:00:00`);
  if (!Number.isFinite(today.valueOf())) return empty;

  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const weekStart = dateKey(start);
  const dailyRows = report.daily.filter((row) => {
    const key = row.period.slice(0, 10);
    return key >= weekStart && key <= todayKey;
  });
  const totalCost = dailyRows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalTokens = dailyRows.reduce((sum, row) => sum + row.totalTokens, 0);
  const activeDays = dailyRows.filter((row) => row.totalCost > 0).length;

  return {
    totalCost,
    totalTokens,
    activeDays,
    averageDaily: activeDays ? totalCost / activeDays : 0,
  };
}

function comparison(delta: number, baseline: number) {
  return { delta, ratio: baseline > 0 ? delta / baseline : null, baseline };
}

function trailingDailyTrend(report: Report | null, todayPeriod: string) {
  if (!report || !todayPeriod) return { points: [], averageDaily: 0, comparison: null };
  const todayKey = todayPeriod.slice(0, 10);
  const points = report.daily
    .filter((row) => row.period.slice(0, 10) <= todayKey)
    .slice(-30)
    .map((row) => ({ period: row.period, value: row.totalCost }));
  const prior = points.filter((point) => point.period.slice(0, 10) < todayKey);
  const averageDaily = prior.length ? prior.reduce((sum, point) => sum + point.value, 0) / prior.length : 0;
  const today = points.at(-1)?.value || 0;
  return {
    points,
    averageDaily,
    comparison: averageDaily > 0 ? comparison(today - averageDaily, averageDaily) : null,
  };
}

function download(name: string, body: string, type: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ stale }: { stale: boolean }) {
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium max-[520px]:hidden ${stale ? "bg-warn-soft text-warn-strong" : "bg-ok-soft text-ok-strong"}`}
      title={stale ? "Showing the last cached snapshot" : "Reading live usage from the daemon"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-warn" : "bg-ok"}`} />
      {stale ? "Cached" : "Live"}
    </span>
  );
}

export default function App() {
  const [period, setPeriod] = useState<HistoryPeriod>("daily");
  const [range, setRange] = useState<HistoryRange>(30);
  const [metric, setMetric] = useState<ChartMetric>("cost");
  const [summary, setSummary] = useState<Summary>(loadingSummary);
  const [report, setReport] = useState<Report | null>(null);
  const [journal, setJournal] = useState<DayJournal | null>(null);
  // The picker spans this week, Sunday through today, and opens on today.
  const journalOptions = useMemo(() => weekOptions(new Date()), []);
  const [journalDate, setJournalDate] = useState(
    () => journalOptions[journalOptions.length - 1]?.value || "",
  );
  const [journalLoading, setJournalLoading] = useState(true);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  // Held in state purely to re-render on change; formatCurrency reads the
  // module-level setting that the effect below installs.
  const [money, setMoney] = useState<MoneyDisplay>(USD);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    rememberToken();
    let active = true;
    let latestLoad: Promise<void> | null = null;

    const loadLatest = (): Promise<void> => {
      if (latestLoad) return latestLoad;
      latestLoad = (async () => {
        // The daemon owns the refresh and coalesces this with any native-app or
        // watcher refresh already in flight. These are cached API reads.
        const nextSummary = await refresh();
        const [nextReport, nextConfig] = await Promise.all([getReport(), getConfig()]);
        if (!active) return;
        setSummary(nextSummary);
        setReport(nextReport);
        setConfig(nextConfig);
        setError(nextSummary.stale ? nextSummary.error : null);
        setLoading(false);
      })()
        .catch((reason: unknown) => {
          if (!active) return;
          setError(reason instanceof Error ? reason.message : "Daemon unavailable");
          setLoading(false);
        })
        .finally(() => {
          latestLoad = null;
        });
      return latestLoad;
    };

    void loadLatest();
    const stop = subscribe(
      (nextSummary) => {
        if (!active) return;
        setSummary(nextSummary);
        setError(nextSummary.stale ? nextSummary.error : null);
        void getReport()
          .then((nextReport) => {
            if (!active) return;
            setReport(nextReport);
          })
          .catch(() => undefined);
      },
      () => undefined,
    );
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void loadLatest();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      active = false;
      stop();
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, []);

  // The menu bar app owns the currency choice and writes it to the shared
  // config; the dashboard follows whatever it finds there.
  useEffect(() => {
    const code = config?.currency || USD.code;
    let active = true;
    void loadMoneyDisplay(code).then((next) => {
      if (!active) return;
      setMoneyDisplay(next);
      setMoney(next);
    });
    return () => {
      active = false;
    };
  }, [config?.currency]);

  useEffect(() => {
    if (!journalDate) return;
    let active = true;
    setJournalLoading(true);
    getJournal(journalDate)
      .then((next) => {
        if (active) setJournal(next);
      })
      .catch(() => {
        if (active) setJournal(null);
      })
      .finally(() => {
        if (active) setJournalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [journalDate]);

  async function doRefresh() {
    setRefreshing(true);
    try {
      const next = await refresh();
      const [nextReport, nextJournal] = await Promise.all([
        getReport(),
        // The journal walks transcript files rather than reading the snapshot,
        // so a failure there must not cost us the rest of the dashboard.
        getJournal(journalDate).catch(() => null),
      ]);
      setSummary(next);
      setReport(nextReport);
      if (nextJournal) setJournal(nextJournal);
      setError(next.stale ? next.error : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const availableRanges = ([7, 30, 90] as HistoryRange[]).filter(
    (value) => value <= (config?.historyDays || 90),
  );
  const activeRange = availableRanges.includes(range)
    ? range
    : availableRanges[availableRanges.length - 1] || 7;
  useEffect(() => {
    if (activeRange <= 7 && period !== "daily") setPeriod("daily");
    else if (activeRange <= 30 && period === "monthly") setPeriod("daily");
  }, [activeRange, period]);
  const rows = useMemo(() => rangeRows(report?.[period] || [], activeRange), [activeRange, period, report]);
  const projects = report?.projects || [];
  const projectTotal = projects.reduce((sum, row) => sum + row.totalCost, 0);
  const weekSummary = useMemo(
    () => weekSummaryFor(report, summary.today.period),
    [report, summary.today.period],
  );
  const todayComparison = useMemo(() => {
    if (!report || !summary.today.period) return null;
    const prior = report.daily.filter((row) => row.period < summary.today.period).slice(-7);
    if (!prior.length) return null;
    const baseline = prior.reduce((sum, row) => sum + row.totalCost, 0) / prior.length;
    return comparison(summary.today.totalCost - baseline, baseline);
  }, [report, summary.today.period, summary.today.totalCost]);
  const monthComparison = useMemo(() => {
    if (!report || !summary.today.period) return null;
    const currentKey = summary.today.period.slice(0, 7);
    const current = report.monthly.find((row) => row.period.startsWith(currentKey));
    const previous = report.monthly.filter((row) => row.period < currentKey).slice(-1)[0];
    if (!current || !previous) return null;
    return comparison(current.totalCost - previous.totalCost, previous.totalCost);
  }, [report, summary.today.period]);
  const dailyTrend = useMemo(
    () => trailingDailyTrend(report, summary.today.period),
    [report, summary.today.period],
  );

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
    <div className="min-h-screen overflow-x-hidden bg-surface text-ink">
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/85 backdrop-blur-xl">
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
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                aria-label="Open settings"
              >
                <Icon path={SLIDERS} />
              </button>
              <button
                className={buttonIcon}
                onClick={() => void doRefresh()}
                disabled={refreshing}
                title={refreshing ? "Refreshing…" : "Refresh usage"}
                aria-label="Refresh usage"
              >
                <Icon path={REFRESH} className={`h-3.5 w-3.5 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button className={buttonPrimary} onClick={() => setShareOpen(true)} aria-label="Share usage">
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
      <main
        className="mx-auto max-w-[1180px] px-8 pb-24 pt-10 max-[760px]:px-[18px] max-[760px]:pt-7"
        aria-busy={loading}
      >
        <div className="mb-8">
          <h1 className="text-[40px] font-semibold leading-none tracking-[-0.04em] max-[760px]:text-[34px] max-[440px]:text-[30px]">
            Token cost
          </h1>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted">
            <Icon path={CLOCK} className="h-3 w-3 shrink-0" />
            {summary.updatedAt
              ? `Updated ${formatUpdatedAt(summary.updatedAt)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
              : "Waiting for first refresh"}
          </p>
        </div>
        {error && (
          <div className="mb-6 rounded-control border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[11px] text-warn-strong">
            <strong className="font-semibold">Daemon notice:</strong> {error}.{" "}
            {summary.updatedAt ? "Showing the last good snapshot." : "Start the daemon to load usage."}
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] gap-5 max-[760px]:grid-cols-1">
          <TodayCard summary={summary} week={weekSummary} trend={dailyTrend} />
          <TotalsCard
            report={report}
            summary={summary}
            config={config}
            todayComparison={todayComparison}
            monthComparison={monthComparison}
          />
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
                  onChange={(value) => setRange(Number(value) as HistoryRange)}
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
            journal={journal}
            options={journalOptions}
            date={journalDate}
            onDateChange={setJournalDate}
            loading={journalLoading}
          />
        </ErrorBoundary>

        <footer className="border-t border-hairline pt-6 text-center text-[10px] leading-relaxed text-muted">
          Costs are estimates from a pricing table, not invoices. <span className="px-1.5">•</span> Data stays
          on this Mac.
          {money.code !== USD.code && (
            <>
              {" "}
              <span className="px-1.5">•</span> Shown in {money.code} at 1 {USD.code} ={" "}
              {money.rate.toFixed(2)}
            </>
          )}{" "}
          <span className="px-1.5">•</span> Last refresh {formatRelativeTime(summary.updatedAt)}
        </footer>
      </main>
      {settingsOpen && config && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 px-4 py-8 backdrop-blur-sm max-[760px]:py-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <div
            className="w-full max-w-[720px] overflow-hidden rounded-card border border-hairline bg-card text-ink shadow-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
          >
            <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Preferences
                </p>
                <h2
                  className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em]"
                  id="settings-dialog-title"
                >
                  Budget and data settings
                </h2>
              </div>
              <button
                className={buttonIcon}
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <Icon path={CLOSE} />
              </button>
            </div>
            <div className="px-6 pb-6">
              <BudgetSettings config={config} inDialog onSaved={setConfig} />
            </div>
          </div>
        </div>
      )}
      {shareOpen && <ShareDialog report={report} summary={summary} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
