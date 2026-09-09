import { BUNDLED_PRICING, estimateCost, type PricingTable } from "../domain/pricing.js";
import { dateForTimeZone, shiftDate } from "../domain/time.js";
import type { LocalUsageRow } from "../domain/usage-merge.js";
import type { ProviderAdapter, ProviderUsageDay } from "../providers/types.js";
import { numberValue } from "../shared/coerce.js";

export function localUsageSinceMs(historyDays: number, now: Date, timezone: string): number {
  const days = Math.max(1, Math.trunc(historyDays) || 1);
  const today = dateForTimeZone(now, timezone);
  const since = shiftDate(today, -(days - 1), timezone);
  return Date.parse(`${since}T00:00:00Z`);
}

export async function collectLocalUsage(
  adapters: ProviderAdapter[],
  sinceMs: number,
  timezone: string,
  pricing: PricingTable = BUNDLED_PRICING,
): Promise<LocalUsageRow[]> {
  const rows: LocalUsageRow[] = [];
  for (const adapter of adapters) {
    if (!adapter.usage) continue;
    try {
      const usage = await adapter.usage(adapter.root(), sinceMs, timezone);
      rows.push(...usage.map((row) => pricedRow(adapter.id, row, pricing)));
    } catch {
      // A provider's local schema can change independently of the daemon. Keep
      // one broken source from hiding the other providers' usage.
    }
  }
  return rows;
}

function pricedRow(agent: string, row: ProviderUsageDay, pricing: PricingTable): LocalUsageRow {
  const inputTokens = numberValue(row.inputTokens);
  const outputTokens = numberValue(row.outputTokens);
  const cacheReadTokens = numberValue(row.cacheReadTokens);
  const cacheCreationTokens = numberValue(row.cacheCreationTokens);
  // Unique tokens processed: cache reads are re-sent prefix bytes already
  // counted in cacheCreation or input, so they must not inflate the total.
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens;
  return {
    ...row,
    agent,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
    totalCost: estimateCost(
      row.model,
      {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      },
      pricing,
    ),
    billing: "subscription",
  };
}
