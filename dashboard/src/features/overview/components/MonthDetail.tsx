import { formatCurrency, formatTokens } from "@shared/lib/format";
import { providerColor, providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import type { MonthProjection } from "../model/spend";

// What the month actually booked, behind the projection it was extrapolated
// from. Hover or focus opens it: the projection is the number worth acting on,
// so the evidence for it sits one gesture away rather than crowding the card.
export function MonthDetail({ projection }: { projection: MonthProjection }) {
  const { actual, providers } = projection;
  const rows: Array<[string, string]> = [
    ["Input", formatTokens(actual.inputTokens)],
    ["Output", formatTokens(actual.outputTokens)],
    ["Cache read", formatTokens(actual.cacheReadTokens)],
    ["Cache write", formatTokens(actual.cacheCreationTokens)],
  ];

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-[236px] rounded-control border border-hairline bg-card px-3 py-2.5 text-[10px] text-ink shadow-pop"
    >
      <div className="font-semibold uppercase tracking-[0.06em] text-muted">Booked this month</div>
      <dl className="mt-1.5 flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div className="flex items-baseline justify-between gap-3" key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-hairline pt-1.5">
          <dt className="text-muted">Total tokens</dt>
          <dd className="font-semibold tabular-nums">{formatTokens(actual.totalTokens)}</dd>
        </div>
      </dl>

      {providers.length > 0 && (
        <>
          <div className="mt-2.5 border-t border-hairline pt-2 font-semibold uppercase tracking-[0.06em] text-muted">
            Cost by provider
          </div>
          <dl className="mt-1.5 flex flex-col gap-1">
            {providers.map((provider) => (
              <div className="flex items-baseline justify-between gap-3" key={provider.agent}>
                <dt className="flex min-w-0 items-center gap-1.5 truncate">
                  <ProviderLogo agent={provider.agent} size={12} color={providerColor(provider.agent)} />
                  {providerName(provider.agent)}
                </dt>
                <dd className="shrink-0 tabular-nums">{formatCurrency(provider.totalCost)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
