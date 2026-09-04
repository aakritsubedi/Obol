import type { UsageRow } from "@shared/api";
import { periodDate } from "@shared/lib/date";

export { periodDate } from "@shared/lib/date";

export function rangeRows(rows: UsageRow[], range: 7 | 30 | 90): UsageRow[] {
  const cutoff = Date.now() - (range - 1) * 86_400_000;
  return rows.filter((row) => {
    const date = periodDate(row.period);
    return date === null || date >= cutoff;
  });
}
