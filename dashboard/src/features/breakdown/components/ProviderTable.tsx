import type { ProviderSummary } from "@shared/api";
import { formatCurrency, formatTokens } from "@shared/lib/format";
import { providerColor, providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import SectionHeader from "@shared/ui/SectionHeader";
import { emptyState, sectionShell } from "@shared/ui/tokens";

interface Props {
  providers: ProviderSummary[];
  total: number;
}

export default function ProviderTable({ providers, total }: Props) {
  return (
    <section className={`min-w-0 ${sectionShell}`} aria-labelledby="providers-heading">
      <SectionHeader
        eyebrow="By provider"
        id="providers-heading"
        title="Where today’s spend went"
        actions={
          <span className="text-[15px] font-semibold tabular-nums tracking-[-0.02em]">
            {formatCurrency(total)}
          </span>
        }
      />
      {providers.length === 0 ? (
        <div className={emptyState}>No provider activity today.</div>
      ) : (
        <div className="grid gap-5">
          {providers.length === 1 ? (
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <ProviderLogo agent={providers[0].agent} size={22} />
              <strong className="font-semibold text-ink">{providerName(providers[0].agent)}</strong>
              {providers[0].totalCost === 0 && (
                <span className="rounded-full bg-wash px-2 py-0.5 text-[10px] font-semibold text-subtle">
                  Free
                </span>
              )}
              <span>
                · {formatTokens(providers[0].totalTokens)} tokens · {formatCurrency(providers[0].totalCost)}
              </span>
            </div>
          ) : (
            providers.map((provider) => {
              const share = total > 0 ? (provider.totalCost / total) * 100 : 0;
              const tokenTotal = providers.reduce((sum, item) => sum + item.totalTokens, 0);
              const free = provider.totalCost === 0;
              const barShare = free && tokenTotal > 0 ? (provider.totalTokens / tokenTotal) * 100 : share;
              const color = providerColor(provider.agent);
              return (
                <div
                  className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3"
                  key={provider.agent}
                >
                  <ProviderLogo agent={provider.agent} size={28} />
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3.5 text-[11px]">
                      <span className="flex items-center gap-2">
                        <strong className="font-semibold">{providerName(provider.agent)}</strong>
                        {free && (
                          <span className="rounded-full bg-wash px-2 py-0.5 text-[10px] font-semibold text-subtle">
                            Free
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted">
                        {free ? "$0.00" : `${share.toFixed(0)}%`}
                      </span>
                    </div>
                    <div className="my-2 h-1 overflow-hidden rounded-full bg-track">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, barShare))}%`,
                          backgroundColor: free ? "var(--color-subtle)" : color,
                        }}
                      />
                    </div>
                    <div className="text-[10px] tabular-nums text-muted">
                      {formatTokens(provider.totalTokens)} tokens · {formatTokens(provider.inputTokens)} in /{" "}
                      {formatTokens(provider.outputTokens)} out
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums tracking-[-0.01em]">
                    {formatCurrency(provider.totalCost)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
