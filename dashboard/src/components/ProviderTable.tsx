import type { ProviderSummary } from "../api";
import { ProviderLogo, providerColor, providerName } from "../providers";
import { formatCurrency, formatTokens } from "./format";

interface Props {
  providers: ProviderSummary[];
  total: number;
}

export default function ProviderTable({ providers, total }: Props) {
  return (
    <section
      className="min-w-0 py-8 pr-8 max-[760px]:border-b max-[760px]:border-hairline max-[760px]:pr-0"
      aria-labelledby="providers-heading"
    >
      <div className="mb-[22px] flex items-start justify-between gap-[18px]">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="providers-heading"
          >
            By provider
          </div>
          <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">Where today’s spend went</h2>
        </div>
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>
      {providers.length === 0 ? (
        <div className="grid min-h-[130px] place-items-center text-center text-xs text-muted">
          No provider activity today.
        </div>
      ) : (
        <div className="grid gap-[19px]">
          {providers.map((provider) => {
            const share = total > 0 ? (provider.totalCost / total) * 100 : 0;
            const color = providerColor(provider.agent);
            return (
              <div
                className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-[11px]"
                key={provider.agent}
              >
                <ProviderLogo agent={provider.agent} size={30} />
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3.5 text-xs">
                    <strong className="font-semibold">{providerName(provider.agent)}</strong>
                    <span className="text-[11px] tabular-nums text-muted">{share.toFixed(0)}%</span>
                  </div>
                  <div className="my-2 h-1 overflow-hidden rounded-full bg-track">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, share))}%`, backgroundColor: color }}
                    />
                  </div>
                  <div className="text-[10px] tabular-nums text-muted">
                    {formatTokens(provider.totalTokens)} tokens · {formatTokens(provider.inputTokens)} in /{" "}
                    {formatTokens(provider.outputTokens)} out
                  </div>
                </div>
                <div className="text-[13px] font-semibold tabular-nums">
                  {formatCurrency(provider.totalCost)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
