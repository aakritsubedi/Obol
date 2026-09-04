import { loadingSummary } from "@features/overview/model/trend";
import {
  getConfig,
  getReport,
  type Report,
  refresh,
  rememberToken,
  type Summary,
  subscribe,
  type WidgetConfig,
} from "@shared/api";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

interface UsageDataValue {
  summary: Summary;
  report: Report | null;
  config: WidgetConfig | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  doRefresh: () => Promise<void>;
  setConfig: (config: WidgetConfig) => void;
}

const UsageDataContext = createContext<UsageDataValue | null>(null);

export function UsageDataProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<Summary>(loadingSummary);
  const [report, setReport] = useState<Report | null>(null);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestLoad = useRef<Promise<void> | null>(null);

  useEffect(() => {
    rememberToken();
    let active = true;

    const loadLatest = async (): Promise<void> => {
      if (latestLoad.current) return latestLoad.current;
      const nextLoad = (async () => {
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
          latestLoad.current = null;
        });
      latestLoad.current = nextLoad;
      return nextLoad;
    };

    void loadLatest();
    const stop = subscribe(
      (nextSummary) => {
        if (!active) return;
        setSummary(nextSummary);
        setError(nextSummary.stale ? nextSummary.error : null);
        void Promise.all([getReport(), getConfig()])
          .then(([nextReport, nextConfig]) => {
            if (!active) return;
            setReport(nextReport);
            setConfig(nextConfig);
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

  async function doRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      const next = await refresh();
      const [nextReport, nextConfig] = await Promise.all([getReport(), getConfig()]);
      setSummary(next);
      setReport(nextReport);
      setConfig(nextConfig);
      setError(next.stale ? next.error : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <UsageDataContext.Provider
      value={{ summary, report, config, loading, error, refreshing, doRefresh, setConfig }}
    >
      {children}
    </UsageDataContext.Provider>
  );
}

export function useUsageData(): UsageDataValue {
  const value = useContext(UsageDataContext);
  if (!value) throw new Error("useUsageData must be used inside UsageDataProvider");
  return value;
}
