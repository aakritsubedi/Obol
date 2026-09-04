import { rangeRows } from "@shared/analytics/ranges";
import type { Report, WidgetConfig } from "@shared/api";
import type { ExportMetric } from "@shared/lib/export";
import { useEffect, useMemo, useState } from "react";

export type HistoryPeriod = "daily" | "weekly" | "monthly";
export type HistoryRange = 7 | 30 | 90;

export function useHistoryControls(report: Report | null, config: WidgetConfig | null) {
  const [period, setPeriod] = useState<HistoryPeriod>("daily");
  const [range, setRange] = useState<HistoryRange>(30);
  const [metric, setMetric] = useState<ExportMetric>("cost");
  const availableRanges = useMemo(
    () => ([7, 30, 90] as HistoryRange[]).filter((value) => value <= (config?.historyDays || 90)),
    [config?.historyDays],
  );
  const activeRange = availableRanges.includes(range)
    ? range
    : availableRanges[availableRanges.length - 1] || 7;

  useEffect(() => {
    if (activeRange <= 7 && period !== "daily") setPeriod("daily");
    else if (activeRange <= 30 && period === "monthly") setPeriod("daily");
  }, [activeRange, period]);

  const rows = useMemo(() => rangeRows(report?.[period] || [], activeRange), [activeRange, period, report]);

  return {
    period,
    setPeriod,
    range,
    setRange,
    metric,
    setMetric,
    availableRanges,
    activeRange,
    rows,
  };
}
