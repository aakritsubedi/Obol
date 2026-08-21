import { useEffect, useMemo, useState } from "react";
import {
  getConfig,
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
import CostChart from "./components/CostChart";
import { formatRelativeTime, formatUpdatedAt } from "./components/format";
import ModelTable from "./components/ModelTable";
import ProjectTable from "./components/ProjectTable";
import ProviderTable from "./components/ProviderTable";
import Ticker from "./components/Ticker";
import TodayCard, { type WeekSummary } from "./components/TodayCard";
import TotalsCard from "./components/TotalsCard";
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

function weekSummaryFor(report: Report | null, todayPeriod: string): WeekSummary {
  const empty: WeekSummary = { totalCost: 0, totalTokens: 0, activeDays: 0, averageDaily: 0 };
  if (!report || !todayPeriod || periodDate(todayPeriod) === null) return empty;

  const todayKey = todayPeriod.slice(0, 10);
  const today = new Date(`${todayKey}T12:00:00`);
  if (!Number.isFinite(today.valueOf())) return empty;

  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = dateKey(monday);
  const dailyRows = report.daily.filter((row) => {
    const key = row.period.slice(0, 10);
    return key >= weekStart && key <= todayKey;
  });
  const weeklyRow = report.weekly.find((row) => row.period.slice(0, 10) === weekStart);
  const totalCost = weeklyRow?.totalCost ?? dailyRows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalTokens = weeklyRow?.totalTokens ?? dailyRows.reduce((sum, row) => sum + row.totalTokens, 0);
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

function download(name: string, body: string, type: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [period, setPeriod] = useState<HistoryPeriod>("daily");
  const [range, setRange] = useState<HistoryRange>(30);
  const [metric, setMetric] = useState<ChartMetric>("cost");
  const [summary, setSummary] = useState<Summary>(loadingSummary);
  const [report, setReport] = useState<Report | null>(null);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  async function doRefresh() {
    setRefreshing(true);
    try {
      const next = await refresh();
      const nextReport = await getReport();
      setSummary(next);
      setReport(nextReport);
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
  const rows = useMemo(() => rangeRows(report?.[period] || [], activeRange), [activeRange, period, report]);
  const projects = report?.projects || [];
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
      <header className="sticky top-0 z-20 mx-auto flex max-w-[1244px] items-center justify-between gap-5 border-b border-hairline bg-surface/90 px-8 py-3.5 backdrop-blur-xl max-[760px]:px-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="whitespace-nowrap text-sm font-bold tracking-[-0.02em]">Obol</span>
          <span className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-wash px-2.5 py-1.5 text-[11px] text-subtle max-[760px]:hidden">
            ◷ Local data · {summary.agents.length} providers
          </span>
        </div>
        <div className="flex items-center gap-2.5 max-[440px]:gap-1.5">
          <div
            className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] ${summary.stale ? "bg-warn-soft text-warn-strong" : "bg-ok-soft text-ok-strong"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${summary.stale ? "bg-warn" : "bg-ok"}`} />
            {summary.stale ? "Cached snapshot" : "Live"}
          </div>
          <button
            className="rounded-full border border-hairline bg-transparent px-3 py-2 text-[11px] font-semibold text-ink transition hover:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[520px]:px-2"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
          >
            ⚙ <span className="max-[520px]:hidden">Settings</span>
          </button>
          <button
            className="rounded-full bg-ink px-3.5 py-2 text-[11px] font-semibold text-surface transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-50 max-[440px]:px-2.5"
            onClick={() => void doRefresh()}
            disabled={refreshing}
            aria-label="Refresh usage"
          >
            ↻ <span className="max-[440px]:hidden">{refreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </header>
      <main
        className="mx-auto max-w-[1180px] px-8 pb-28 pt-12 max-[760px]:px-[18px] max-[760px]:pt-[34px]"
        aria-busy={loading}
      >
        <div className="mb-7">
          <h1 className="text-[44px] font-bold leading-none tracking-[-0.05em] max-[760px]:text-[38px] max-[440px]:text-[34px]">
            Token cost
          </h1>
          <p className="mt-2.5 text-xs text-muted">
            ◷{" "}
            {summary.updatedAt
              ? `Usage updated ${formatUpdatedAt(summary.updatedAt)}`
              : "Usage waiting for first refresh"}
          </p>
        </div>
        {error && (
          <div className="mb-[18px] rounded-xl border border-warn/20 bg-warn-soft px-3.5 py-2.5 text-xs text-warn-strong">
            <strong>Daemon notice:</strong> {error}.{" "}
            {summary.updatedAt ? "Showing the last good snapshot." : "Start the daemon to load usage."}
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] gap-10 max-[760px]:grid-cols-1 max-[760px]:gap-0 pb-8">
          <TodayCard summary={summary} week={weekSummary} />
          <TotalsCard
            report={report}
            summary={summary}
            todayComparison={todayComparison}
            monthComparison={monthComparison}
          />
        </div>

        <section className="border-t border-dashed py-12" aria-labelledby="history-heading">
          <div className="mb-[22px] flex items-start justify-between gap-[18px] max-[760px]:flex-wrap">
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
                id="history-heading"
              >
                History
              </div>
              <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">Spend over time</h2>
              <p className="mt-1 text-[11px] text-muted">
                {rows.length} {period} periods in the current view
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 max-[760px]:w-full max-[760px]:justify-start">
              <div
                className="flex gap-0.5 rounded-full border border-hairline bg-panel p-[3px]"
                aria-label="History period"
              >
                {(["daily", "weekly", "monthly"] as HistoryPeriod[]).map((value) => (
                  <button
                    className={`rounded-full border-0 px-2.5 py-1.5 text-[11px] ${period === value ? "bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "bg-transparent text-muted"}`}
                    key={value}
                    type="button"
                    onClick={() => setPeriod(value)}
                    aria-pressed={period === value}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div
                className="flex gap-0.5 rounded-full border border-hairline bg-panel p-[3px]"
                aria-label="History range"
              >
                {availableRanges.map((value) => (
                  <button
                    className={`rounded-full border-0 px-2.5 py-1.5 text-[11px] ${activeRange === value ? "bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "bg-transparent text-muted"}`}
                    key={value}
                    type="button"
                    onClick={() => setRange(value)}
                    aria-pressed={activeRange === value}
                  >
                    {value}d
                  </button>
                ))}
              </div>
              <div
                className="flex gap-0.5 rounded-full border border-hairline bg-panel p-[3px]"
                aria-label="Chart metric"
              >
                {(["cost", "tokens"] as ChartMetric[]).map((value) => (
                  <button
                    className={`rounded-full border-0 px-2.5 py-1.5 text-[11px] ${metric === value ? "bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "bg-transparent text-muted"}`}
                    key={value}
                    type="button"
                    onClick={() => setMetric(value)}
                    aria-pressed={metric === value}
                  >
                    {value === "cost" ? "Cost" : "Tokens"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  className="rounded-full border border-hairline bg-transparent px-2.5 py-1.5 text-[11px] text-muted transition hover:bg-wash"
                  type="button"
                  onClick={downloadCurrentCsv}
                >
                  CSV
                </button>
                <button
                  className="rounded-full border border-hairline bg-transparent px-2.5 py-1.5 text-[11px] text-muted transition hover:bg-wash"
                  type="button"
                  onClick={downloadCurrentJson}
                >
                  JSON
                </button>
              </div>
            </div>
          </div>
          <CostChart rows={rows} metric={metric} />
        </section>

        <div className="border-y border-hairline">
          <ProviderTable providers={summary.agents} total={summary.today.totalCost} />
        </div>
        <ModelTable report={report} />
        {projects.length > 0 && (
          <>
            <section className="border-t border-hairline py-8" aria-labelledby="project-chart-heading">
              <div className="mb-[22px]">
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
                  id="project-chart-heading"
                >
                  Project history
                </div>
                <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">Cost by Claude project</h2>
              </div>
              <CostChart rows={rangeRows(projects, activeRange)} metric="cost" groupBy="project" />
            </section>
            <ProjectTable projects={projects} />
          </>
        )}
        {!config && (
          <div className="grid min-h-[110px] place-items-center border-t border-hairline py-8 text-center text-xs text-muted">
            Budget configuration is unavailable.
          </div>
        )}
        <footer className="mt-3 text-center text-[10px] text-muted">
          Costs are estimates from pricing table, not invoices. <span className="px-1.5">•</span> Data stays
          on this Mac. <span className="px-1.5">•</span> Last refresh {formatRelativeTime(summary.updatedAt)}
        </footer>
      </main>
      <Ticker summary={summary} />
      {settingsOpen && config && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/30 px-4 py-8 backdrop-blur-sm max-[760px]:py-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <div
            className="w-full max-w-[760px] overflow-hidden rounded-2xl border border-hairline bg-card text-ink shadow-[0_24px_70px_rgba(0,0,0,.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
          >
            <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">
                  Preferences
                </p>
                <h2 className="mt-1 text-lg font-bold tracking-[-0.03em]" id="settings-dialog-title">
                  Budget and data settings
                </h2>
              </div>
              <button
                className="grid h-8 w-8 place-items-center rounded-full border border-hairline text-muted transition hover:bg-wash hover:text-ink"
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>
            <div className="px-6 pb-6">
              <BudgetSettings config={config} inDialog onSaved={setConfig} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
